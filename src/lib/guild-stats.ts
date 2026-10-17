import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { attendanceSummary, betterStatus, type RecordedRaid } from "@/lib/attendance";
import { REALM_TIMEZONE, hasStarted, playerHref, type AttendanceStatus } from "@/lib/wow";

// Fun guild stats for the homepage (#107). Counted in the app for now: every query is paged past PostgREST's
// 1000-row limit, and the result is cached for an hour (and dropped when attendance is saved), so the cost is a few
// queries an hour rather than per visit.

export const GUILD_STATS_TAG = "guild-stats";

export type StatItem = { id: number; name: string; quality: number; icon: string | null };

// One line of a stat card: a player (main character in class colour), a class, an item or plain text. Bars also get
// the count itself.
export type StatEntry = {
  key: string;
  name: string;
  href?: string;
  color?: string;
  count?: number;
  item?: StatItem;
  avatar?: string | null;
  value: string;
  hint?: string;
};

// "top" lists the first few; "spotlight" shows only the winner, big, with their Discord avatar (or the item icon);
// "bars" is a bar chart of every entry, twice as wide as a top card.
export type Stat = {
  id: string;
  title: string;
  blurb: string;
  layout: "top" | "spotlight" | "bars";
  entries: StatEntry[];
};

// Sign-up changes this close to the start (or after it) count as last minute.
const LAST_MINUTE_HOURS = 3;
const TOP = 5;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// "40 min", "5 hours", "3 days"
function duration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "seconds";
  if (minutes < 60) return plural(minutes, "min", "min");
  const hours = Math.round(minutes / 60);
  return hours < 48 ? plural(hours, "hour") : plural(Math.round(hours / 24), "day");
}

// Every row of a query, a page of 1000 at a time. The query must have a stable order.
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < size) return rows;
  }
}

// Highest counts first, ties by name, only counts above zero.
function top<K>(counts: Map<K, number>, name: (key: K) => string, n = TOP) {
  return [...counts]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])))
    .slice(0, n);
}

function bump<K>(counts: Map<K, number>, key: K, by = 1) {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

type HistoryRow = {
  id: number;
  at: string;
  actor: string | null;
  action: "insert" | "update" | "delete";
  raid_id: string | null;
  old_character: string | null;
  old_status: string | null;
  new_character: string | null;
  new_status: string | null;
};

async function computeGuildStats(supabase: SupabaseClient): Promise<Stat[]> {
  const [profiles, characters, classes, raids, attendance, reserves, items, history] = await Promise.all([
    fetchAll<{ id: string; slug: string; display_name: string; avatar_url: string | null; created_at: string }>(
      (f, t) =>
        supabase.from("profiles").select("id, slug, display_name, avatar_url, created_at").order("id").range(f, t),
    ),
    fetchAll<{
      id: string;
      owner_id: string;
      name: string;
      class_id: string;
      main_spec_id: string;
      is_main: boolean;
      archived_at: string | null;
    }>((f, t) =>
      supabase
        .from("characters")
        .select("id, owner_id, name, class_id, main_spec_id, is_main, archived_at")
        .order("id")
        .range(f, t),
    ),
    fetchAll<{ id: string; name: string; color: string }>((f, t) =>
      supabase.from("classes").select("id, name, color").order("id").range(f, t),
    ),
    fetchAll<{ id: string; title: string; instance: string; starts_at: string; locked_at: string | null }>((f, t) =>
      supabase.from("raids").select("id, title, instance, starts_at, locked_at").order("id").range(f, t),
    ),
    fetchAll<{ raid_id: string; character_id: string; status: AttendanceStatus }>((f, t) =>
      supabase
        .from("attendance")
        .select("raid_id, character_id, status")
        .order("raid_id")
        .order("character_id")
        .range(f, t),
    ),
    fetchAll<{ raid_id: string; character_id: string; item_id: number }>((f, t) =>
      supabase
        .from("reserves")
        .select("raid_id, character_id, item_id")
        .order("raid_id")
        .order("character_id")
        .order("item_id")
        .range(f, t),
    ),
    fetchAll<StatItem>((f, t) => supabase.from("loot_items").select("id, name, quality, icon").order("id").range(f, t)),
    // Only the sign-up fields the stats need, not the whole old and new rows.
    fetchAll<HistoryRow>((f, t) =>
      supabase
        .from("history")
        .select(
          "id, at, actor, action, raid_id, old_character:old->>character_id, old_status:old->>status, new_character:new->>character_id, new_status:new->>status",
        )
        .eq("table_name", "signups")
        .order("id")
        .range(f, t),
    ),
  ]);

  const classById = new Map(classes.map((c) => [c.id, c]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const charById = new Map(characters.map((c) => [c.id, c]));
  const raidById = new Map(raids.map((r) => [r.id, r]));
  const pastRaids = new Set(raids.filter((r) => hasStarted(r.starts_at)).map((r) => r.id));

  // Per player (all characters together), shown as their main: the first main that isn't archived, else any.
  const mainOf = new Map<string, (typeof characters)[number]>();
  for (const c of [...characters].sort(
    (a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || Number(b.is_main) - Number(a.is_main),
  )) {
    if (!mainOf.has(c.owner_id)) mainOf.set(c.owner_id, c);
  }
  const profileById = new Map(profiles.filter((p) => mainOf.has(p.id)).map((p) => [p.id, p]));
  const playerName = (id: string) => mainOf.get(id)?.name ?? "";
  const playerEntry = (id: string, value: string, hint?: string): StatEntry => {
    const p = profileById.get(id)!;
    const main = mainOf.get(id)!;
    return {
      key: id,
      name: main.name,
      href: playerHref(p.slug),
      color: classById.get(main.class_id)?.color,
      avatar: p.avatar_url,
      value,
      hint: hint ?? (p.display_name !== main.name ? p.display_name : undefined),
    };
  };
  const playerTop = (counts: Map<string, number>, value: (n: number) => string, n = TOP) =>
    top(counts, playerName, n)
      .filter(([id]) => profileById.has(id))
      .map(([id, c]) => playerEntry(id, value(c)));
  const ownerOf = (characterId: string | null) => (characterId ? charById.get(characterId)?.owner_id : undefined);

  // Attendance per player and raid, the best status across their characters, as on /attendance.
  const recorded = new Map<string, RecordedRaid>();
  const byPlayer = new Map<string, Map<string, AttendanceStatus>>();
  for (const a of attendance) {
    const raid = raidById.get(a.raid_id);
    const owner = ownerOf(a.character_id);
    if (!raid || !owner) continue;
    recorded.set(raid.id, { id: raid.id, title: raid.title, startsAt: raid.starts_at });
    const perRaid = byPlayer.get(owner) ?? new Map<string, AttendanceStatus>();
    perRaid.set(raid.id, betterStatus(perRaid.get(raid.id), a.status));
    byPlayer.set(owner, perRaid);
  }
  const recordedRaids = [...recorded.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const attended = new Map<string, number>();
  const attendedPct = new Map<string, number | null>();
  const benched = new Map<string, number>();
  const noShows = new Map<string, number>();
  for (const [id, p] of profileById) {
    const summary = attendanceSummary(recordedRaids, byPlayer.get(id) ?? new Map(), p.created_at);
    attended.set(id, summary.counts.present + summary.counts.benched);
    attendedPct.set(id, summary.pct);
    benched.set(id, summary.counts.benched);
    noShows.set(id, summary.counts.no_show);
  }

  // Classes in raids: a character's attendance as present counts for its class.
  const classCounts = new Map<string, number>();
  for (const a of attendance) {
    const c = charById.get(a.character_id);
    if (c && a.status === "present") bump(classCounts, c.class_id);
  }

  // Alts: characters still in use.
  const characterCounts = new Map<string, number>();
  for (const c of characters) if (!c.archived_at) bump(characterCounts, c.owner_id);

  // Sign-up changes players made themselves (not officers on their behalf; the Discord bot acts as the player).
  const lastMinute = new Map<string, number>();
  const flipFlops = new Map<string, number>();
  const firstSignup = new Map<string, string>();
  // Per player, their pull-out closest to the sign-up lock (ms before it).
  const closestPullOut = new Map<string, number>();
  for (const h of history) {
    const owner = ownerOf(h.new_character ?? h.old_character);
    const raid = h.raid_id ? raidById.get(h.raid_id) : undefined;
    if (!owner || !raid || h.actor !== owner) continue;
    const before = new Date(raid.starts_at).getTime() - new Date(h.at).getTime();
    if (before < LAST_MINUTE_HOURS * 60 * 60 * 1000) bump(lastMinute, owner);
    if (h.action === "update" && h.old_status !== h.new_status) bump(flipFlops, owner);
    // History is in id order, so the first insert seen for a raid is its first sign-up.
    if (h.action === "insert" && !firstSignup.has(raid.id)) firstSignup.set(raid.id, owner);
    // Pulling out: an accepted sign-up switched to declined, or withdrawn, while sign-ups were still open. A raid an
    // officer reopened (no lock) counts up to its start.
    const pulledOut = h.old_status === "accepted" && (h.action === "delete" || h.new_status === "declined");
    const beforeLock = new Date(raid.locked_at ?? raid.starts_at).getTime() - new Date(h.at).getTime();
    if (pulledOut && beforeLock >= 0 && beforeLock < (closestPullOut.get(owner) ?? Infinity)) {
      closestPullOut.set(owner, beforeLock);
    }
  }
  const earlyBird = new Map<string, number>();
  for (const owner of firstSignup.values()) bump(earlyBird, owner);

  // Soft reserves, only of raids that have started.
  const itemReserves = new Map<number, number>();
  const raidItemReserves = new Map<string, number>();
  const playerItemRaids = new Map<string, Set<string>>();
  for (const r of reserves) {
    if (!pastRaids.has(r.raid_id) || !itemById.has(r.item_id)) continue;
    bump(itemReserves, r.item_id);
    bump(raidItemReserves, `${r.raid_id}:${r.item_id}`);
    const owner = ownerOf(r.character_id);
    if (!owner) continue;
    const key = `${owner}:${r.item_id}`;
    playerItemRaids.set(key, (playerItemRaids.get(key) ?? new Set()).add(r.raid_id));
  }
  const itemName = (id: number) => itemById.get(id)?.name ?? "";
  const sameOld = [...playerItemRaids]
    .map(([key, raidIds]) => {
      const [owner, item] = key.split(":");
      return { owner, item: Number(item), raids: raidIds.size };
    })
    .filter((x) => x.raids > 1 && profileById.has(x.owner))
    .sort((a, b) => b.raids - a.raids || playerName(a.owner).localeCompare(playerName(b.owner)))
    .slice(0, TOP);

  // Raids run, per instance.
  const instanceCounts = new Map<string, number>();
  for (const id of pastRaids) bump(instanceCounts, raidById.get(id)!.instance);
  const raiderNights = [...byPlayer.values()].reduce(
    (sum, perRaid) => sum + [...perRaid.values()].filter((s) => s === "present").length,
    0,
  );

  const newest = [...profileById.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  const joined = new Intl.DateTimeFormat("en-GB", { timeZone: REALM_TIMEZONE, day: "numeric", month: "short" });

  const stats: Stat[] = [
    {
      id: "iron-raider",
      title: "Iron Raider",
      layout: "top",
      blurb: "Most raids attended (present or benched)",
      entries: top(attended, playerName)
        .filter(([id]) => profileById.has(id))
        .map(([id, n]) => playerEntry(id, plural(n, "raid"), `${attendedPct.get(id) ?? 0}%`)),
    },
    {
      id: "classes",
      title: "Classes in Raids",
      layout: "bars",
      blurb: "Times each class was present",
      // Every class, also the ones that never came, highest first.
      entries: (classCounts.size ? classes : [])
        .map((c) => ({ c, n: classCounts.get(c.id) ?? 0 }))
        .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name))
        .map(({ c, n }) => ({ key: c.id, name: c.name, color: c.color, count: n, value: String(n) })),
    },
    {
      id: "alt-oholic",
      title: "Alt-oholic",
      layout: "spotlight",
      blurb: "Most characters",
      entries: playerTop(new Map([...characterCounts].filter(([, n]) => n > 1)), (n) => plural(n, "character")),
    },
    {
      id: "bench-warmer",
      title: "Bench Warmer",
      layout: "top",
      blurb: "Most times benched. Thanks for your patience!",
      entries: playerTop(benched, (n) => plural(n, "time")),
    },
    {
      id: "ghost",
      title: "Ghost",
      layout: "spotlight",
      blurb: "Most no-shows",
      entries: playerTop(noShows, (n) => plural(n, "no-show")),
    },
    {
      id: "last-minute",
      title: "Last Minute Larry",
      layout: "spotlight",
      blurb: `Sign-up changes in the last ${LAST_MINUTE_HOURS} hours before a raid`,
      entries: playerTop(lastMinute, (n) => plural(n, "change")),
    },
    {
      id: "flip-flopper",
      title: "Flip-flopper",
      layout: "spotlight",
      blurb: "Most switches between accepted and declined",
      entries: playerTop(flipFlops, (n) => plural(n, "switch", "switches")),
    },
    {
      id: "early-bird",
      title: "Early Bird",
      layout: "spotlight",
      blurb: "First to sign up, most often",
      entries: playerTop(earlyBird, (n) => (n === 1 ? "first once" : `first ${n} times`)),
    },
    {
      id: "last-pull-out",
      title: "Premature Exit",
      layout: "spotlight",
      blurb: "Pulled out closest to the sign-up lock",
      entries: [...closestPullOut]
        .filter(([id]) => profileById.has(id))
        .sort((a, b) => a[1] - b[1] || playerName(a[0]).localeCompare(playerName(b[0])))
        .slice(0, TOP)
        .map(([id, ms]) => playerEntry(id, `${duration(ms)} before the lock`)),
    },
    {
      id: "most-wanted",
      title: "Most Wanted",
      layout: "spotlight",
      blurb: "Most soft reserved items",
      entries: top(itemReserves, itemName).map(([id, n]) => ({
        key: String(id),
        name: itemName(id),
        item: itemById.get(id),
        value: plural(n, "reserve"),
      })),
    },
    {
      id: "contested",
      title: "Contested",
      layout: "spotlight",
      blurb: "Most reserves on one item in one raid",
      entries: top(new Map([...raidItemReserves].filter(([, n]) => n > 1)), (key) => key, 3).map(([key, n]) => {
        const [raidId, itemId] = key.split(":");
        return {
          key,
          name: itemName(Number(itemId)),
          item: itemById.get(Number(itemId)),
          value: plural(n, "reserve"),
          hint: raidById.get(raidId)?.title,
        };
      }),
    },
    {
      id: "same-old",
      title: "Same Old",
      layout: "spotlight",
      blurb: "Reserved the same item, raid after raid",
      entries: sameOld.map((x) => playerEntry(x.owner, plural(x.raids, "raid"), itemName(x.item))),
    },
    {
      id: "raids-run",
      title: "Raids Run",
      layout: "top",
      blurb: `${plural(pastRaids.size, "raid")} and ${plural(raiderNights, "raider night")} so far`,
      entries: top(instanceCounts, (name) => name).map(([name, n]) => ({ key: name, name, value: plural(n, "raid") })),
    },
    {
      id: "newest",
      title: "Fresh Meat",
      layout: "spotlight",
      blurb: "Newest member. Welcome!",
      entries: newest.map((p) => playerEntry(p.id, joined.format(new Date(p.created_at)))),
    },
  ];
  return stats.filter((s) => s.entries.length > 0);
}

// Reads with the secret key (the audit log is admin-only); only names and counts leave it.
async function loadGuildStats() {
  const admin = createAdminClient();
  return admin ? computeGuildStats(admin) : [];
}

// Cached for everyone alike. The cache outlives deployments, so the key holds the deployed commit: a deploy that
// changes the stats starts afresh. Not cached in development, so changes show straight away.
const cachedGuildStats = unstable_cache(loadGuildStats, ["guild-stats", process.env.VERCEL_GIT_COMMIT_SHA ?? "local"], {
  revalidate: 3600,
  tags: [GUILD_STATS_TAG],
});

export const getGuildStats = process.env.NODE_ENV === "development" ? loadGuildStats : cachedGuildStats;
