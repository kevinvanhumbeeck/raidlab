import Link from "next/link";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  canEditRaid,
  hasStarted,
  playerHref,
  type AttendanceStatus,
  type SignupStatus,
} from "@/lib/wow";
import { saveAttendance } from "./actions";
import { readable } from "@/lib/theme";

// Written out in full so Tailwind picks up the classes.
const CHECKED: Record<AttendanceStatus, string> = {
  present: "peer-checked:bg-emerald-500",
  benched: "peer-checked:bg-sky-500",
  absent: "peer-checked:bg-zinc-400",
  no_show: "peer-checked:bg-red-500",
};

type CharacterJoin = {
  id: string;
  name: string;
  class_id: string;
  owner_id: string;
  profiles: { slug: string; display_name: string } | null;
};

export default async function RaidAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { id } = raid;
  const { saved } = await searchParams;
  const viewer = await requireViewer();
  const { supabase, isOfficer } = viewer;
  const started = hasStarted(raid.starts_at);
  // Officers record attendance once the raid has started, until the edit window closes (#88).
  const canEdit = canEditRaid(raid, viewer) && started;

  const [{ data: signups }, { data: slots }, { data: attendance }, { data: classes }] = await Promise.all([
    supabase
      .from("signups")
      .select("status, characters(id, name, class_id, owner_id, profiles(slug, display_name))")
      .eq("raid_id", id)
      .overrideTypes<{ status: SignupStatus; characters: CharacterJoin | null }[], { merge: false }>(),
    supabase
      .from("comp_slots")
      .select("characters(id, name, class_id, owner_id, profiles(slug, display_name))")
      .eq("raid_id", id)
      .overrideTypes<{ characters: CharacterJoin | null }[], { merge: false }>(),
    supabase
      .from("attendance")
      .select("status, characters(id, name, class_id, owner_id, profiles(slug, display_name))")
      .eq("raid_id", id)
      .overrideTypes<{ status: AttendanceStatus; characters: CharacterJoin | null }[], { merge: false }>(),
    supabase.from("classes").select("id, color"),
  ]);

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const recorded = (attendance?.length ?? 0) > 0;

  // Suggest a status from the comp and sign-ups until attendance has been saved.
  const rows = new Map<string, { character: CharacterJoin; status: AttendanceStatus }>();
  for (const s of signups ?? []) {
    if (s.characters)
      rows.set(s.characters.id, { character: s.characters, status: s.status === "accepted" ? "benched" : "absent" });
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
        {isOfficer && !started && (
          <p className="text-sm opacity-70">Attendance can be saved once the raid has started.</p>
        )}
        {!recorded && canEdit && sorted.length > 0 && (
          <p className="text-sm text-warn">
            Not saved yet. Suggested from the comp: placed is present, bench is benched, declined is absent. Adjust and
            save.
          </p>
        )}
        {saved && <p className="text-sm text-success">Attendance saved.</p>}
      </section>

      {sorted.length === 0 ? (
        <p className="opacity-70">Nobody signed up or was placed in this raid.</p>
      ) : (
        <form action={saveAttendance.bind(null, raid.id, raid.slug)} className="space-y-4">
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
            {sorted.map(({ character, status }) => (
              <li key={character.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
                <Link
                  href={playerHref(character.profiles?.slug ?? "", character.name)}
                  className="w-40 font-medium hover:underline"
                  style={{ color: readable(color.get(character.class_id)) }}
                >
                  {character.name}
                </Link>
                <span className="text-xs opacity-60">{character.profiles?.display_name}</span>
                <fieldset className="ml-auto flex gap-1" disabled={!canEdit}>
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
          {canEdit && (
            <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
              Save attendance
            </button>
          )}
        </form>
      )}
    </div>
  );
}
