import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import {
  SIGNUP_STATUSES,
  STATUS_LABELS,
  formatRaidTime,
  primaryRole,
  requirementsOf,
  type SignupStatus,
} from "@/lib/wow";
import { deleteRaid, officerSignUp, signUp, withdraw } from "../actions";
import { SignupBoard, type SignupRow as SignupRowView } from "./signup-board";
import { SignupForm } from "./signup-form";

// Many-to-one joins return a single object at runtime.
type SignupRow = {
  character_id: string;
  status: SignupStatus;
  spec_id: string | null;
  note: string | null;
  characters: {
    name: string;
    class_id: string;
    main_spec_id: string;
    owner_id: string;
    profiles: { display_name: string } | null;
  } | null;
};

export default async function RaidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, isOfficer } = await requireViewer();

  const [{ data: raid }, { data: signups }, { data: classes }, { data: specs }, { data: myCharacters }] =
    await Promise.all([
      supabase.from("raids").select("id, title, instance, size, starts_at, notes").eq("id", id).maybeSingle(),
      supabase
        .from("signups")
        .select("character_id, status, spec_id, note, characters(name, class_id, main_spec_id, owner_id, profiles(display_name))")
        .eq("raid_id", id)
        .overrideTypes<SignupRow[], { merge: false }>(),
      supabase.from("classes").select("id, name, color"),
      supabase.from("specs").select("id, name, roles"),
      supabase
        .from("characters")
        .select("id, name, main_spec_id, off_spec_ids")
        .eq("owner_id", user.id)
        .order("is_main", { ascending: false }),
    ]);
  if (!raid) notFound();

  const [{ data: allCharacters }, { data: instance }] = await Promise.all([
    isOfficer
      ? supabase.from("characters").select("id, name, class_id, main_spec_id").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string; main_spec_id: string }[] }),
    supabase
      .from("instances")
      .select("name, size, tanks, healers, dps")
      .eq("name", raid.instance)
      .maybeSingle(),
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));

  const rows = (signups ?? []).flatMap((s) => {
    const ch = s.characters;
    if (!ch) return [];
    const specId = s.spec_id ?? ch.main_spec_id;
    const spec = specById.get(specId);
    const row: SignupRowView = {
      characterId: s.character_id,
      status: s.status,
      note: s.note,
      name: ch.name,
      player: ch.profiles?.display_name ?? null,
      isMine: ch.owner_id === user.id,
      color: classById.get(ch.class_id)?.color ?? "#ccc",
      specId,
      specName: spec?.name ?? "",
      role: primaryRole(spec),
    };
    return [row];
  });

  const mine = rows.find((r) => r.isMine);
  const mySignup = signups?.find((s) => s.character_id === mine?.characterId);

  const formCharacters = (myCharacters ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    specs: [c.main_spec_id, ...c.off_spec_ids].map((sid: string) => ({
      id: sid,
      name: specById.get(sid)?.name ?? sid,
    })),
  }));

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <Link href="/raids" className="text-sm opacity-70 hover:opacity-100">
          ← All raids
        </Link>
        <h1 className="text-2xl font-semibold">{raid.title}</h1>
        <p className="opacity-80">
          {raid.instance} · {raid.size}-man · {formatRaidTime(raid.starts_at)} server time
        </p>
        {raid.notes && <p className="text-sm opacity-70">{raid.notes}</p>}
        <Link
          href={`/raids/${raid.id}/comp`}
          className="mt-2 inline-block rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {isOfficer ? "Edit composition" : "View composition"}
        </Link>
        <Link
          href={`/raids/${raid.id}/attendance`}
          className="ml-2 mt-2 inline-block rounded border border-border px-3 py-1.5 text-sm"
        >
          Attendance
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your sign-up</h2>
        {formCharacters.length ? (
          <>
            <SignupForm
              action={signUp.bind(null, raid.id)}
              characters={formCharacters}
              current={
                mine && mySignup
                  ? {
                      characterId: mine.characterId,
                      specId: mySignup.spec_id,
                      status: mine.status,
                      note: mine.note,
                    }
                  : undefined
              }
            />
            {mine && (
              <form action={withdraw.bind(null, raid.id, mine.characterId)}>
                <button className="text-sm text-red-400 hover:text-red-300">Remove my sign-up</button>
              </form>
            )}
          </>
        ) : (
          <p className="opacity-70">
            <Link href="/characters" className="underline">
              Add a character
            </Link>{" "}
            first to sign up.
          </p>
        )}
      </section>

      {isOfficer && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sign up a player</h2>
          <form
            action={officerSignUp.bind(null, raid.id)}
            className="flex flex-wrap items-end gap-3 rounded border border-border bg-panel p-4"
          >
            <label className="space-y-1">
              <span className="block text-sm">Character</span>
              <select name="character_id" required className="rounded border border-border bg-background px-2 py-1.5">
                {allCharacters
                  ?.filter((c) => !rows.some((r) => r.characterId === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {specById.get(c.main_spec_id)?.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-sm">Status</span>
              <select name="status" defaultValue="accepted" className="rounded border border-border bg-background px-2 py-1.5">
                {SIGNUP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">Add</button>
          </form>
        </section>
      )}

      <SignupBoard
        raidId={raid.id}
        size={raid.size}
        rows={rows}
        requirements={requirementsOf(instance)}
        canEdit={isOfficer}
      />

      {isOfficer && (
        <form action={deleteRaid.bind(null, raid.id)} className="border-t border-border pt-4">
          <button className="text-sm text-red-400 hover:text-red-300">Delete raid</button>
        </form>
      )}
    </div>
  );
}
