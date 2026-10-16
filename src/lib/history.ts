import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTENDANCE_LABELS,
  DUTY_LABELS,
  ROLE_NAMES,
  STATUS_LABELS,
  type AttendanceStatus,
  type RaidDuty,
  type Role,
  type SignupStatus,
} from "@/lib/wow";

// The audit log (#90): a change to one row, written by a database trigger. Only admins can read it.
type Row = Record<string, unknown>;
export type HistoryEntry = {
  id: number;
  at: string;
  actor: string | null;
  table_name: string;
  action: "insert" | "update" | "delete";
  raid_id: string | null;
  old: Row | null;
  new: Row | null;
};

export type HistoryLine = {
  id: number;
  at: string;
  // Display name of who made the change; null for the system (e.g. the Discord bot on its own).
  actor: string | null;
  raid: { slug: string; title: string } | null;
  text: string;
};

// Columns that change along with the ones that matter, and only add noise.
const SKIPPED = new Set(["updated_at", "created_at", "slug"]);

// A page of changes, newest first, with the ids to page from: newer and older are null when there's nothing more
// that way.
export type HistoryPage = { lines: HistoryLine[]; newer: number | null; older: number | null };

// Changes overall or for one raid, described in words. Paged by id rather than page number, so a page doesn't shift
// while new changes come in: before gives the changes older than that id, after the ones newer than it.
export async function loadHistory(
  supabase: SupabaseClient,
  { raidId = null, before, after, limit }: { raidId?: string | null; before?: number; after?: number; limit: number },
): Promise<HistoryPage> {
  let query = supabase.from("history").select("*");
  if (raidId) query = query.eq("raid_id", raidId);
  if (after) query = query.gt("id", after).order("id", { ascending: true });
  else query = (before ? query.lt("id", before) : query).order("id", { ascending: false });
  // One extra row tells whether there's another page.
  const { data } = await query.limit(limit + 1).overrideTypes<HistoryEntry[], { merge: false }>();
  const more = (data?.length ?? 0) > limit;
  const entries = (data ?? []).slice(0, limit);
  if (after) entries.reverse();
  const hasNewer = after ? more : !!before;
  const hasOlder = after ? entries.length > 0 : more;

  const ids = (key: string) => [
    ...new Set(entries.flatMap((e) => [e.old?.[key], e.new?.[key]]).filter((v): v is string => typeof v === "string")),
  ];
  const itemIds = [
    ...new Set(entries.flatMap((e) => [e.old?.item_id, e.new?.item_id]).filter((v) => typeof v === "number")),
  ] as number[];
  const raidIds = [...new Set(entries.flatMap((e) => (e.raid_id ? [e.raid_id] : [])))];
  const profileIds = [
    ...new Set([...entries.flatMap((e) => (e.actor ? [e.actor] : [])), ...ids("owner_id"), ...ids("id")]),
  ];

  const [{ data: profiles }, { data: characters }, { data: raids }, { data: items }, { data: specs }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name").in("id", profileIds),
      supabase.from("characters").select("id, name").in("id", ids("character_id")),
      supabase.from("raids").select("id, slug, title").in("id", raidIds),
      supabase.from("loot_items").select("id, name").in("id", itemIds),
      supabase.from("specs").select("id, name"),
    ]);
  const profileName = new Map(profiles?.map((p) => [p.id, p.display_name as string]));
  const characterName = new Map(characters?.map((c) => [c.id, c.name as string]));
  const raidById = new Map(raids?.map((r) => [r.id, { slug: r.slug as string, title: r.title as string }]));
  const itemName = new Map(items?.map((i) => [i.id, i.name as string]));
  const specName = new Map(specs?.map((s) => [s.id, s.name as string]));

  const names: Names = {
    character: (id) => characterName.get(String(id)) ?? "a deleted character",
    item: (id) => itemName.get(Number(id)) ?? `item ${id}`,
    spec: (id) => (id ? (specName.get(String(id)) ?? String(id)) : "default spec"),
    player: (id) => profileName.get(String(id)) ?? "a player",
  };

  const lines = entries.map((e): HistoryLine => ({
    id: e.id,
    at: e.at,
    actor: e.actor ? (profileName.get(e.actor) ?? "a deleted player") : null,
    raid: e.raid_id ? (raidById.get(e.raid_id) ?? { slug: "", title: "a deleted raid" }) : null,
    text: describe(e, names),
  }));
  return {
    lines,
    newer: hasNewer && entries.length ? entries[0].id : null,
    older: hasOlder && entries.length ? entries[entries.length - 1].id : null,
  };
}

// The before/after cursor from search params, ignoring anything that isn't a positive id.
export function historyCursor(params: { before?: string; after?: string }) {
  const id = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return { before: id(params.before), after: id(params.after) };
}

type Names = {
  character: (id: unknown) => string;
  item: (id: unknown) => string;
  spec: (id: unknown) => string;
  player: (id: unknown) => string;
};

const label = (labels: Record<string, string>, value: unknown) => labels[String(value)] ?? String(value);

function describe(e: HistoryEntry, n: Names): string {
  const row = (e.new ?? e.old)!;
  const char = () => n.character(row.character_id);
  const slot = (r: Row) => `split ${r.split_no}, group ${r.group_no}`;

  switch (e.table_name) {
    case "raids":
      if (e.action === "insert") return `created the raid "${row.title}"`;
      if (e.action === "delete") return `deleted the raid "${row.title}"`;
      if (e.old?.locked_at !== e.new?.locked_at && Object.keys(changes(e)).length === 1) {
        return e.new?.locked_at ? "locked sign-ups" : "unlocked sign-ups";
      }
      return `changed the raid: ${changeText(e, n)}`;
    case "signups":
      if (e.action === "insert")
        return `signed up ${char()}: ${label(STATUS_LABELS, row.status)}, ${n.spec(row.spec_id)}`;
      if (e.action === "delete") return `removed ${char()}'s sign-up`;
      return `changed ${char()}'s sign-up: ${changeText(e, n)}`;
    case "comp_slots":
      if (e.action === "insert") return `placed ${char()} in ${slot(row)}`;
      if (e.action === "delete") return `took ${char()} out of ${slot(row)}`;
      return `changed ${char()} in the comp: ${changeText(e, n)}`;
    case "raid_duties": {
      const duty = `${label(DUTY_LABELS, row.duty as RaidDuty)} of split ${row.split_no}`;
      if (e.action === "insert") return `made ${char()} ${duty}`;
      if (e.action === "delete") return `removed ${char()} as ${duty}`;
      return `changed the ${duty}: ${changeText(e, n)}`;
    }
    case "reserves":
      return e.action === "delete"
        ? `removed ${char()}'s reserve on ${n.item(row.item_id)}`
        : `reserved ${n.item(row.item_id)} for ${char()}`;
    case "hard_reserves":
      return e.action === "delete"
        ? `removed the hard reserve on ${n.item(row.item_id)}`
        : `hard-reserved ${n.item(row.item_id)}`;
    case "attendance":
      if (e.action === "insert")
        return `recorded ${char()} as ${label(ATTENDANCE_LABELS, row.status as AttendanceStatus)}`;
      if (e.action === "delete") return `removed ${char()}'s attendance`;
      return `changed ${char()}'s attendance: ${changeText(e, n)}`;
    case "characters":
      if (e.action === "insert") return `added the character ${row.name} for ${n.player(row.owner_id)}`;
      if (e.action === "delete") return `deleted the character ${row.name} for good`;
      if (!e.old?.archived_at && e.new?.archived_at) return `archived ${row.name}`;
      if (e.old?.archived_at && !e.new?.archived_at) return `restored ${row.name}`;
      return `changed ${row.name}: ${changeText(e, n)}`;
    case "profiles":
      return `changed ${row.display_name}'s access: ${changeText(e, n)}`;
    default:
      return `${e.action} in ${e.table_name}`;
  }
}

function changes(e: HistoryEntry) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(e.old ?? {}), ...Object.keys(e.new ?? {})])) {
    if (SKIPPED.has(key)) continue;
    const before = e.old?.[key];
    const after = e.new?.[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) out[key] = [before, after];
  }
  return out;
}

function changeText(e: HistoryEntry, n: Names) {
  const value = (key: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "none";
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (Array.isArray(v)) return v.length ? v.map((x) => value(key, x)).join(", ") : "none";
    if (key === "status") return label({ ...STATUS_LABELS, ...ATTENDANCE_LABELS }, v as SignupStatus);
    if (key === "role") return label(ROLE_NAMES, v as Role);
    if (key.endsWith("spec_id") || key === "off_spec_ids") return n.spec(v);
    if (key === "character_id") return n.character(v);
    if (key.endsWith("_at")) return new Date(String(v)).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    return String(v);
  };
  const parts = Object.entries(changes(e)).map(
    ([key, [before, after]]) =>
      `${key.replace(/_id$|_ids$/, "").replaceAll("_", " ")} ${value(key, before)} → ${value(key, after)}`,
  );
  return parts.join("; ") || "no visible change";
}
