import Link from "next/link";
import { attendanceByPlayer, attendanceSummary, type AttendanceRow } from "@/lib/attendance";
import { requireViewer } from "@/lib/viewer";
import { ATTENDANCE_COLORS, ATTENDANCE_LABELS, ATTENDANCE_STATUSES, formatRaidTime, playerHref } from "@/lib/wow";
import { readable } from "@/lib/theme";

const RECENT = 10;

export default async function AttendancePage() {
  const { supabase, user } = await requireViewer();

  const [{ data: rows }, { data: profiles }, { data: characters }, { data: classes }] = await Promise.all([
    supabase
      .from("attendance")
      .select("status, raid_id, raids(title, starts_at), characters(owner_id)")
      .overrideTypes<AttendanceRow[], { merge: false }>(),
    supabase.from("profiles").select("id, slug, display_name, created_at"),
    supabase.from("characters").select("id, owner_id, name, class_id, is_main").order("is_main", { ascending: false }),
    supabase.from("classes").select("id, color"),
  ]);

  const { raids: raidList, byPlayer } = attendanceByPlayer(rows ?? []);

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const mainOf = new Map<string, { id: string; name: string; class_id: string }>();
  for (const c of characters ?? []) if (!mainOf.has(c.owner_id)) mainOf.set(c.owner_id, c);

  const players = (profiles ?? [])
    .filter((p) => mainOf.has(p.id))
    .map((p) => {
      const summary = attendanceSummary(raidList, byPlayer.get(p.id) ?? new Map(), p.created_at);
      return {
        id: p.id,
        slug: p.slug,
        player: p.display_name,
        main: mainOf.get(p.id)!,
        ...summary,
        recent: summary.history.slice(0, RECENT),
      };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.main.name.localeCompare(b.main.name));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Attendance</h1>
      <p className="text-sm opacity-70">
        Over {raidList.length} raid{raidList.length === 1 ? "" : "s"} with recorded attendance, counting only raids
        since each player joined. Present and benched count as attended.
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
        <div className="overflow-x-auto rounded-xl border border-border bg-panel/90">
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
                <tr key={p.id} className={p.id === user.id ? "bg-foreground/5" : undefined}>
                  <td className="px-3 py-2">
                    <Link
                      href={playerHref(p.slug)}
                      className="font-medium hover:underline"
                      style={{ color: readable(color.get(p.main.class_id)) }}
                    >
                      {p.main.name}
                    </Link>
                    {p.player !== p.main.name && <span className="ml-2 text-xs opacity-60">{p.player}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {p.pct === null ? "—" : `${p.pct}%`}
                  </td>
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
