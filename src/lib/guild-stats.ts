import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { attendanceSummary, betterStatus, type RecordedRaid } from "@/lib/attendance";
import { COUNTS_AS_ATTENDED, REALM_TIMEZONE, hasStarted, playerHref, type AttendanceStatus } from "@/lib/wow";

// Fun guild stats for the homepage (#107). Counted in the app for now: every query is paged past PostgREST's
// 1000-row limit, and the result is cached for an hour (and dropped when attendance is saved), so the cost is a few
// queries an hour rather than per visit.

export const GUILD_STATS_TAG = "guild-stats";

export type StatItem = { id: number; name: string; quality: number; icon: string | null };

// One line of a stat card: a player (main character in class colour), a class, a spec, an item or plain text.
export type StatEntry = {
  key: string;
  name: string;
  href?: string;
  color?: string;
  specId?: string;
  item?: StatItem;
  avatar?: string | null;
  value: string;
  hint?: string;
};

// "top" lists the first few; "spotlight" shows only the winner, big, with their Discord avatar (or the item icon).
export type Stat = { id: string; title: string; blurb: string; layout: "top" | "spotlight"; entries: StatEntry[] };

// Sign-up changes this close to the start (or after it) count as last minute.
const LAST_MINUTE_HOURS = 3;
const TOP = 5;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

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
  const [profiles, characters, classes, specs, raids, attendance, slots, reserves, items, history] = await Promise.all([
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
    fetchAll<{ id: string; name: string; class_id: string }>((f, t) =>
      supabase.from("specs").select("id, name, class_id").order("id").range(f, t),
    ),
    fetchAll<{ id: string; title: string; instance: string; starts_at: string }>((f, t) =>
      supabase.from("raids").select("id, title, instance, starts_at").order("id").range(f, t),
    ),
    fetchAll<{ raid_id: string; character_id: string; status: AttendanceStatus }>((f, t) =>
      supabase
        .from("attendance")
        .select("raid_id, character_id, status")
        .order("raid_id")
        .order("character_id")
        .range(f, t),
    ),
    fetchAll<{ raid_id: string; character_id: string; spec_id: string | null }>((f, t) =>
      supabase
        .from("comp_slots")
        .select("raid_id, character_id, spec_id")
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
  const specById = new Map(specs.map((s) => [s.id, s]));
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
  const longestStreak = new Map<string, number>();
  const currentStreak = new Map<string, number>();
  for (const [id, p] of profileById) {
    const summary = attendanceSummary(recordedRaids, byPlayer.get(id) ?? new Map(), p.created_at);
    attended.set(id, summary.counts.present + summary.counts.benched);
    attendedPct.set(id, summary.pct);
    benched.set(id, summary.counts.benched);
    noShows.set(id, summary.counts.no_show);
    // History is newest first: the current streak runs from the newest raid back, the longest anywhere.
    const hits = summary.history.map((h) => COUNTS_AS_ATTENDED.includes(h.status));
    const current = hits.indexOf(false);
    currentStreak.set(id, current === -1 ? hits.length : current);
    let run = 0;
    let best = 0;
    for (const hit of hits) {
      run = hit ? run + 1 : 0;
      best = Math.max(best, run);
    }
    longestStreak.set(id, best);
  }

  // Classes and specs as placed in comps of raids that have started. Where attendance was recorded, only players who
  // were there count.
  const presentIn = new Set(
    attendance.filter((a) => a.status === "present").map((a) => `${a.raid_id}:${a.character_id}`),
  );
  const classCounts = new Map<string, number>();
  const specCounts = new Map<string, number>();
  for (const s of slots) {
    const c = charById.get(s.character_id);
    if (!c || !pastRaids.has(s.raid_id)) continue;
    if (recorded.has(s.raid_id) && !presentIn.has(`${s.raid_id}:${s.character_id}`)) continue;
    bump(classCounts, c.class_id);
    bump(specCounts, s.spec_id ?? c.main_spec_id);
  }
  const specName = (id: string) => {
    const s = specById.get(id);
    return s ? `${s.name} ${classById.get(s.class_id)?.name ?? ""}`.trim() : id;
  };
  const specEntry = ([id, n]: [string, number]): StatEntry => ({
    key: id,
    name: specName(id),
    specId: id,
    color: classById.get(specById.get(id)?.class_id ?? "")?.color,
    value: plural(n, "raid"),
  });

  // Alts: characters still in use.
  const characterCounts = new Map<string, number>();
  for (const c of characters) if (!c.archived_at) bump(characterCounts, c.owner_id);

  // Sign-up changes players made themselves (not officers on their behalf; the Discord bot acts as the player).
  const lastMinute = new Map<string, number>();
  const flipFlops = new Map<string, number>();
  const firstSignup = new Map<string, string>();
  for (const h of history) {
    const owner = ownerOf(h.new_character ?? h.old_character);
    const raid = h.raid_id ? raidById.get(h.raid_id) : undefined;
    if (!owner || !raid || h.actor !== owner) continue;
    const before = new Date(raid.starts_at).getTime() - new Date(h.at).getTime();
    if (before < LAST_MINUTE_HOURS * 60 * 60 * 1000) bump(lastMinute, owner);
    if (h.action === "update" && h.old_status !== h.new_status) bump(flipFlops, owner);
    // History is in id order, so the first insert seen for a raid is its first sign-up.
    if (h.action === "insert" && !firstSignup.has(raid.id)) firstSignup.set(raid.id, owner);
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

  // Raids run, per instance and weekday (in server time).
  const instanceCounts = new Map<string, number>();
  const weekdayCounts = new Map<string, number>();
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: REALM_TIMEZONE, weekday: "long" });
  for (const id of pastRaids) {
    const raid = raidById.get(id)!;
    bump(instanceCounts, raid.instance);
    bump(weekdayCounts, weekday.format(new Date(raid.starts_at)));
  }
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
      id: "streak-master",
      title: "Streak Master",
      layout: "top",
      blurb: "Longest run of raids attended in a row",
      entries: playerTop(longestStreak, (n) => plural(n, "raid")),
    },
    {
      id: "on-a-roll",
      title: "On a Roll",
      layout: "top",
      blurb: "Raids attended in a row, up to the last one",
      entries: playerTop(new Map([...currentStreak].filter(([, n]) => n > 1)), (n) => plural(n, "raid")),
    },
    {
      id: "class",
      title: "Most Played Class",
      layout: "top",
      blurb: "Comp spots in raids so far",
      entries: top(classCounts, (id) => classById.get(id)?.name ?? id).map(([id, n]) => ({
        key: id,
        name: classById.get(id)?.name ?? id,
        color: classById.get(id)?.color,
        value: plural(n, "raid"),
      })),
    },
    {
      id: "spec",
      title: "Most Played Spec",
      layout: "top",
      blurb: "Comp spots in raids so far",
      entries: top(specCounts, specName).map(specEntry),
    },
    {
      id: "rare-spec",
      title: "Rare Sighting",
      layout: "top",
      blurb: "Specs that raided, but hardly ever",
      entries: top(specCounts, specName, specCounts.size).reverse().slice(0, 3).map(specEntry),
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
      blurb: "Signed up, never showed up",
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
      blurb: "First to sign up for a raid",
      entries: playerTop(earlyBird, (n) => plural(n, "raid")),
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
      id: "busiest-night",
      title: "Busiest Night",
      layout: "spotlight",
      blurb: "Raids per weekday",
      entries: top(weekdayCounts, (day) => day, 3).map(([day, n]) => ({
        key: day,
        name: day,
        value: plural(n, "raid"),
      })),
    },
    {
      id: "newest",
      title: "Fresh Meat",
      layout: "spotlight",
      blurb: "Newest members. Welcome!",
      entries: newest.map((p) => playerEntry(p.id, joined.format(new Date(p.created_at)))),
    },
  ];
  return stats.filter((s) => s.entries.length > 0);
}

// Cached for everyone alike, so it reads with the secret key (the audit log is admin-only); only counts leave it.
export const getGuildStats = unstable_cache(
  async () => {
    const admin = createAdminClient();
    return admin ? computeGuildStats(admin) : [];
  },
  // Bump the version when the shape of the stats changes: the cache outlives deployments.
  ["guild-stats", "v2"],
  { revalidate: 3600, tags: [GUILD_STATS_TAG] },
);
