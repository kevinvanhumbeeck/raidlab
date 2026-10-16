import { ATTENDANCE_STATUSES, COUNTS_AS_ATTENDED, type AttendanceStatus } from "@/lib/wow";

export type RecordedRaid = { id: string; title: string; startsAt: string };

// A player with several characters in one raid gets the best of their statuses.
export function betterStatus(prev: AttendanceStatus | undefined, next: AttendanceStatus) {
  return !prev || ATTENDANCE_STATUSES.indexOf(next) < ATTENDANCE_STATUSES.indexOf(prev) ? next : prev;
}

// A player's attendance over the raids with recorded attendance (newest first). Only raids since
// the player joined count, and no record means absent.
export function attendanceSummary(raids: RecordedRaid[], perRaid: Map<string, AttendanceStatus>, joinedAt: string) {
  const eligible = raids.filter((r) => r.startsAt >= joinedAt.slice(0, 10));
  const statuses = eligible.map((r) => perRaid.get(r.id) ?? "absent");
  const counts = Object.fromEntries(
    ATTENDANCE_STATUSES.map((s) => [s, statuses.filter((x) => x === s).length]),
  ) as Record<AttendanceStatus, number>;
  const attended = statuses.filter((s) => COUNTS_AS_ATTENDED.includes(s)).length;
  return {
    total: eligible.length,
    pct: eligible.length ? Math.round((attended / eligible.length) * 100) : null,
    counts,
    history: eligible.map((raid, i) => ({ raid, status: statuses[i] })),
  };
}

export type AttendanceRow = {
  status: AttendanceStatus;
  raid_id: string;
  raids: { title: string; starts_at: string } | null;
  characters: { owner_id: string } | null;
};

// Raids with recorded attendance (newest first), and per player and raid the best status across their characters.
export function attendanceByPlayer(rows: AttendanceRow[]) {
  const raids = new Map<string, RecordedRaid>();
  for (const r of rows) {
    if (r.raids) raids.set(r.raid_id, { id: r.raid_id, title: r.raids.title, startsAt: r.raids.starts_at });
  }
  const byPlayer = new Map<string, Map<string, AttendanceStatus>>();
  for (const r of rows) {
    if (!r.characters) continue;
    const perRaid = byPlayer.get(r.characters.owner_id) ?? new Map<string, AttendanceStatus>();
    perRaid.set(r.raid_id, betterStatus(perRaid.get(r.raid_id), r.status));
    byPlayer.set(r.characters.owner_id, perRaid);
  }
  return { raids: [...raids.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt)), byPlayer };
}
