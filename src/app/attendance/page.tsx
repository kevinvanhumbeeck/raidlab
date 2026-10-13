import { requireViewer } from "@/lib/viewer";
import {
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  COUNTS_AS_ATTENDED,
  formatRaidTime,
  type AttendanceStatus,
} from "@/lib/wow";

type Row = {
  status: AttendanceStatus;
  raid_id: string;
  raids: { title: string; starts_at: string } | null;
  characters: { owner_id: string } | null;
};

const RECENT = 10;

export default async function AttendancePage() {
  const { supabase, user } = await requireViewer();

  const [{ data: rows }, { data: profiles }, { data: characters }, { data: classes }] = await Promise.all([
    supabase
      .from("attendance")
      .select("status, raid_id, raids(title, starts_at), characters(owner_id)")
      .overrideTypes<Row[], { merge: false }>(),
    supabase.from("profiles").select("id, display_name, created_at"),
    supabase.from("characters").select("owner_id, name, class_id, is_main").order("is_main", { ascending: false }),
    supabase.from("classes").select("id, color"),
  ]);

  // Raids with recorded attendance, newest first.
  const raids = new Map<string, { id: string; title: string; startsAt: string }>();
  for (const r of rows ?? []) {
    if (r.raids) raids.set(r.raid_id, { id: r.raid_id, title: r.raids.title, startsAt: r.raids.starts_at });
  }
  const raidList = [...raids.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  // Per player and raid, the best status across their characters.
  const byPlayer = new Map<string, Map<string, AttendanceStatus>>();
  for (const r of rows ?? []) {
    if (!r.characters) continue;
    const perRaid = byPlayer.get(r.characters.owner_id) ?? new Map<string, AttendanceStatus>();
    const prev = perRaid.get(r.raid_id);
    if (!prev || ATTENDANCE_STATUSES.indexOf(r.status) < ATTENDANCE_STATUSES.indexOf(prev)) {
      perRaid.set(r.raid_id, r.status);
    }
    byPlayer.set(r.characters.owner_id, perRaid);
  }

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const mainOf = new Map<string, { name: string; class_id: string }>();
  for (const c of characters ?? []) if (!mainOf.has(c.owner_id)) mainOf.set(c.owner_id, c);

  const players = (profiles ?? [])
    .filter((p) => mainOf.has(p.id))
    .map((p) => {
      // Only raids since the player joined count; no record means absent.
      const eligible = raidList.filter((r) => r.startsAt >= p.created_at.slice(0, 10));
      const perRaid = byPlayer.get(p.id) ?? new Map();
      const statuses = eligible.map((r) => (perRaid.get(r.id) ?? "absent") as AttendanceStatus);
      const counts = Object.fromEntries(
        ATTENDANCE_STATUSES.map((s) => [s, statuses.filter((x) => x === s).length]),
      ) as Record<AttendanceStatus, number>;
      const attended = statuses.filter((s) => COUNTS_AS_ATTENDED.includes(s)).length;
      return {
        id: p.id,
        player: p.display_name,
        main: mainOf.get(p.id)!,
        total: eligible.length,
        pct: eligible.length ? Math.round((attended / eligible.length) * 100) : null,
        counts,
        recent: eligible.slice(0, RECENT).map((r, i) => ({ raid: r, status: statuses[i] })),
      };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.main.name.localeCompare(b.main.name));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Attendance</h1>
      <p className="text-sm opacity-70">
        Over {raidList.length} raid{raidList.length === 1 ? "" : "s"} with recorded attendance, counting only raids since
        each player joined. Present, late and benched count as attended.
      </p>
      <div className="flex flex-wrap gap-3 text-xs">
        {ATTENDANCE_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-sm ${ATTENDANCE_COLORS[s]}`} /> {ATTENDANCE_LABELS[s]}
          </span>
        ))}
      </div>

      {players.length === 0 ? (
        <p className="opacity-70">No players yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-panel">
          <table className="w-full text-sm">
            <thead className="text-left text-xs opacity-70">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                {ATTENDANCE_STATUSES.map((s) => (
                  <th key={s} className="px-3 py-2 text-right font-medium">
                    {ATTENDANCE_LABELS[s]}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Last {RECENT} (newest first)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {players.map((p) => (
                <tr key={p.id} className={p.id === user.id ? "bg-white/5" : undefined}>
                  <td className="px-3 py-2">
                    <span className="font-medium" style={{ color: color.get(p.main.class_id) }}>
                      {p.main.name}
                    </span>
                    {p.player !== p.main.name && <span className="ml-2 text-xs opacity-60">{p.player}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.pct === null ? "—" : `${p.pct}%`}</td>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <td key={s} className="px-3 py-2 text-right tabular-nums opacity-80">
                      {p.counts[s]}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {p.recent.map(({ raid, status }) => (
                        <span
                          key={raid.id}
                          title={`${raid.title} · ${formatRaidTime(raid.startsAt)} · ${ATTENDANCE_LABELS[status]}`}
                          className={`h-3 w-3 rounded-sm ${ATTENDANCE_COLORS[status]}`}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
