import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { NoResponse } from "@/components/no-response";
import { roleOptions } from "@/lib/coverage";
import { botEnabled } from "@/lib/discord-bot";
import { noResponse } from "@/lib/no-response";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import {
  SIGNUP_STATUSES,
  STATUS_LABELS,
  canEditRaid,
  hasStarted,
  isLocked,
  primaryRole,
  requirementsOf,
  slotText,
  type SignupStatus,
} from "@/lib/wow";
import { deleteRaid, officerSignUp, postToDiscord, signUp, withdraw } from "../actions";
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
    off_spec_ids: string[];
    owner_id: string;
    profiles: { slug: string; display_name: string } | null;
  } | null;
};

export default async function RaidPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { id } = raid;
  const viewer = await requireViewer();
  const { supabase, user, isOfficer, isAdmin } = viewer;
  const started = hasStarted(raid.starts_at);
  const canEdit = canEditRaid(raid, viewer);

  const [
    { data: signups },
    { data: classes },
    { data: specs },
    { data: myCharacters },
    { data: slots },
    { data: allCharacters },
    { data: instance },
    missing,
  ] = await Promise.all([
    supabase
      .from("signups")
      .select(
        "character_id, status, spec_id, note, characters(name, class_id, main_spec_id, off_spec_ids, owner_id, profiles(slug, display_name))",
      )
      .eq("raid_id", id)
      .overrideTypes<SignupRow[], { merge: false }>(),
    supabase.from("classes").select("id, name, color"),
    supabase.from("specs").select("id, name, roles"),
    supabase
      .from("characters")
      .select("id, name, main_spec_id, off_spec_ids, archived_at")
      .eq("owner_id", user.id)
      .order("is_main", { ascending: false }),
    supabase.from("comp_slots").select("split_no, group_no, character_id").eq("raid_id", id),
    canEdit
      ? supabase
          .from("characters")
          .select("id, name, owner_id, class_id, main_spec_id")
          .is("archived_at", null)
          .order("name")
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string;
            owner_id: string;
            class_id: string;
            main_spec_id: string;
          }[],
        }),
    supabase.from("instances").select("name, size, tanks, healers, dps").eq("name", raid.instance).maybeSingle(),
    isOfficer && !started ? noResponse(supabase, id) : Promise.resolve(null),
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
      playerSlug: ch.profiles?.slug ?? "",
      status: s.status,
      note: s.note,
      name: ch.name,
      player: ch.profiles?.display_name ?? null,
      isMine: ch.owner_id === user.id,
      color: classById.get(ch.class_id)?.color ?? "#ccc",
      specId,
      specName: spec?.name ?? "",
      role: primaryRole(spec),
      options: roleOptions([specId, ch.main_spec_id, ...ch.off_spec_ids], specById),
    };
    return [row];
  });

  const mine = rows.find((r) => r.isMine);
  const unsigned = (allCharacters ?? []).filter((c) => !rows.some((r) => r.characterId === c.id));
  // Officers signing up an alt of someone who's already in replace that sign-up.
  const signedUpAs = new Map(
    (signups ?? []).flatMap((s) => (s.characters ? [[s.characters.owner_id, s.characters.name] as const] : [])),
  );
  const myIds = new Set(myCharacters?.map((c) => c.id));
  const mySlot = slots?.find((s) => myIds.has(s.character_id));
  const mySignup = signups?.find((s) => s.character_id === mine?.characterId);

  // Archived characters keep their place in past raids, but don't sign up (#89).
  const formCharacters = (myCharacters ?? [])
    .filter((c) => !c.archived_at)
    .map((c) => ({
      id: c.id,
      name: c.name,
      specs: [c.main_spec_id, ...c.off_spec_ids].map((sid: string) => ({
        id: sid,
        name: specById.get(sid)?.name ?? sid,
      })),
    }));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your sign-up</h2>
        {formCharacters.length ? (
          <>
            {isLocked(raid) && !canEdit ? (
              <p className="rounded-xl border border-border bg-panel/90 p-4 text-sm">
                Sign-ups are locked.{" "}
                {mine ? (
                  <>
                    You&apos;re signed up as <strong>{STATUS_LABELS[mine.status]}</strong> on {mine.name}.
                  </>
                ) : (
                  "You didn't sign up for this raid."
                )}{" "}
                <span className="opacity-70">Ask an officer if something changed.</span>
              </p>
            ) : (
              <SignupForm
                action={signUp.bind(null, raid.id)}
                withdrawAction={mine ? withdraw.bind(null, raid.id, mine.characterId) : undefined}
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
            )}
            {mySlot ? (
              <p className="text-sm text-success">
                You&apos;re in {slotText(raid.splits, mySlot.split_no, mySlot.group_no)}
                {mySlot.character_id !== mine?.characterId &&
                  ` on ${myCharacters?.find((c) => c.id === mySlot.character_id)?.name}`}
                .{" "}
                <Link href={`/raids/${raid.slug}/comp`} className="underline">
                  See the composition
                </Link>
              </p>
            ) : (
              mine &&
              (slots?.length ?? 0) > 0 && (
                <p className="text-sm opacity-70">You&apos;re not in the composition (yet).</p>
              )
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

      <SignupBoard
        raidId={raid.id}
        size={raid.size * raid.splits}
        rows={rows}
        requirements={requirementsOf(instance, raid.splits)}
        canEdit={canEdit}
      />

      {isOfficer && (
        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Officer tools</h2>
          {missing && (
            <>
              <h3 className="text-sm font-medium opacity-80">No response</h3>
              <NoResponse raid={raid} missing={missing} canPing={botEnabled()} />
            </>
          )}
          {canEdit && <h3 className="text-sm font-medium opacity-80">Sign up a player</h3>}
          {!canEdit ? null : unsigned.length === 0 ? (
            <p className="rounded-xl border border-border bg-panel/90 p-4 text-sm opacity-70">
              Every player is signed up.
            </p>
          ) : (
            <form
              action={officerSignUp.bind(null, raid.id)}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-panel/90 p-4"
            >
              <label className="space-y-1">
                <span className="block text-sm">Character</span>
                <select name="character_id" required className="h-9.5 rounded border border-border bg-background px-2">
                  {unsigned.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {specById.get(c.main_spec_id)?.name}
                      {signedUpAs.has(c.owner_id) && ` (replaces ${signedUpAs.get(c.owner_id)})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-sm">Status</span>
                <select
                  name="status"
                  defaultValue="accepted"
                  className="h-9.5 rounded border border-border bg-background px-2"
                >
                  {SIGNUP_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              {/* Same box as the selects. The fill stops inside a transparent border, because the selects' dim
                border reads as background and a full-bleed fill looks a pixel taller on each side. */}
              <button className="h-9.5 rounded border border-transparent bg-accent bg-clip-padding px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                Add
              </button>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {botEnabled() && (
              <form action={postToDiscord.bind(null, raid.id)}>
                <button className="rounded bg-discord px-3 py-1.5 text-sm font-medium text-white hover:brightness-110">
                  Post or refresh in Discord
                </button>
              </form>
            )}
            {/* A raid that has started is history: only admins delete it (#87). */}
            {(isAdmin || !started) && (
              <form action={deleteRaid.bind(null, raid.id)}>
                <ConfirmButton
                  message="Delete this raid? This also removes its sign-ups, composition and attendance."
                  className="rounded bg-red-400 px-3 py-1.5 text-sm font-medium text-red-950 hover:bg-red-300"
                >
                  Delete raid
                </ConfirmButton>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
