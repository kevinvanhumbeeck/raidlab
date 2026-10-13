import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  formatRaidTime,
  type AttendanceStatus,
  type SignupStatus,
} from "@/lib/wow";
import { saveAttendance } from "./actions";

// Written out in full so Tailwind picks up the classes.
const CHECKED: Record<AttendanceStatus, string> = {
  present: "peer-checked:bg-emerald-500",
  late: "peer-checked:bg-amber-400",
  benched: "peer-checked:bg-sky-500",
  absent: "peer-checked:bg-red-500",
};

type CharacterJoin = { id: string; name: string; class_id: string; profiles: { display_name: string } | null };

export default async function RaidAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { supabase, isOfficer } = await requireViewer();

  const [{ data: raid }, { data: signups }, { data: slots }, { data: attendance }, { data: classes }] =
    await Promise.all([
      supabase.from("raids").select("id, title, instance, size, starts_at").eq("id", id).maybeSingle(),
      supabase
        .from("signups")
        .select("status, characters(id, name, class_id, profiles(display_name))")
        .eq("raid_id", id)
        .overrideTypes<{ status: SignupStatus; characters: CharacterJoin | null }[], { merge: false }>(),
      supabase
        .from("comp_slots")
        .select("characters(id, name, class_id, profiles(display_name))")
        .eq("raid_id", id)
        .overrideTypes<{ characters: CharacterJoin | null }[], { merge: false }>(),
      supabase
        .from("attendance")
        .select("status, characters(id, name, class_id, profiles(display_name))")
        .eq("raid_id", id)
        .overrideTypes<{ status: AttendanceStatus; characters: CharacterJoin | null }[], { merge: false }>(),
      supabase.from("classes").select("id, color"),
    ]);
  if (!raid) notFound();

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const recorded = (attendance?.length ?? 0) > 0;

  // Suggest a status from the comp and sign-ups until attendance has been saved.
  const rows = new Map<string, { character: CharacterJoin; status: AttendanceStatus }>();
  for (const s of signups ?? []) {
    if (s.characters) rows.set(s.characters.id, { character: s.characters, status: s.status === "bench" ? "benched" : "absent" });
  }
  for (const s of slots ?? []) {
    if (s.characters) rows.set(s.characters.id, { character: s.characters, status: "present" });
  }
  for (const a of attendance ?? []) {
    if (a.characters) rows.set(a.characters.id, { character: a.characters, status: a.status });
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      ATTENDANCE_STATUSES.indexOf(a.status) - ATTENDANCE_STATUSES.indexOf(b.status) ||
      a.character.name.localeCompare(b.character.name),
  );

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <Link href={`/raids/${raid.id}`} className="text-sm opacity-70 hover:opacity-100">
          ← Sign-ups
        </Link>
        <h1 className="text-2xl font-semibold">{raid.title} — attendance</h1>
        <p className="opacity-80">
          {raid.instance} · {formatRaidTime(raid.starts_at)} server time
        </p>
        {!recorded && isOfficer && sorted.length > 0 && (
          <p className="text-sm text-amber-400">
            Not saved yet. Suggested from the comp (present) and sign-ups (benched / absent) — adjust and save.
          </p>
        )}
        {saved && <p className="text-sm text-emerald-400">Attendance saved.</p>}
      </section>

      {sorted.length === 0 ? (
        <p className="opacity-70">Nobody signed up or was placed in this raid.</p>
      ) : (
        <form action={saveAttendance.bind(null, raid.id)} className="space-y-4">
          <ul className="divide-y divide-border rounded border border-border bg-panel">
            {sorted.map(({ character, status }) => (
              <li key={character.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
                <span className="w-40 font-medium" style={{ color: color.get(character.class_id) }}>
                  {character.name}
                </span>
                <span className="text-xs opacity-60">{character.profiles?.display_name}</span>
                <fieldset className="ml-auto flex gap-1" disabled={!isOfficer}>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <label key={s} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`status:${character.id}`}
                        value={s}
                        defaultChecked={s === status}
                        className="peer sr-only"
                      />
                      <span
                        className={`inline-block rounded border border-border px-2 py-1 text-xs opacity-60 peer-checked:border-transparent peer-checked:text-black peer-checked:opacity-100 ${CHECKED[s]} peer-focus-visible:ring-2 peer-focus-visible:ring-accent`}
                      >
                        {ATTENDANCE_LABELS[s]}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
          {isOfficer && (
            <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white">Save attendance</button>
          )}
        </form>
      )}
    </div>
  );
}
