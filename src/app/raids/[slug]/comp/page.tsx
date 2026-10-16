import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { attendanceByPlayer, attendanceSummary, type AttendanceRow } from "@/lib/attendance";
import { roleOptions } from "@/lib/coverage";
import { gargulGroups } from "@/lib/gargul";
import { getRaid, myDutySplits } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { MAX_SPLITS, primaryRole, requirementsOf, type RaidDuty, type Role, type SignupStatus } from "@/lib/wow";
import { setSplits } from "./actions";
import { CompBoard, type BoardCharacter } from "./comp-board";

type CharacterJoin = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  off_spec_ids: string[];
  owner_id: string;
  is_main: boolean;
  profiles: { display_name: string; created_at: string } | null;
};

const CHARACTER =
  "id, name, class_id, main_spec_id, off_spec_ids, owner_id, is_main, profiles(display_name, created_at)";

export default async function CompPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { id } = raid;
  const { supabase, user, isOfficer } = await requireViewer();
  const leading = await myDutySplits(supabase, id, user.id, "raid_lead");

  // Other raids within 6 hours, to flag players already placed in a parallel split.
  const start = new Date(raid.starts_at).getTime();
  const window = 6 * 60 * 60 * 1000;

  const [
    { data: signups },
    { data: slots },
    { data: duties },
    { data: classes },
    { data: specs },
    { data: nearby },
    { data: instance },
    { data: roster },
    { data: attendanceRows },
  ] = await Promise.all([
    supabase
      .from("signups")
      .select(`character_id, status, spec_id, note, characters(${CHARACTER})`)
      .eq("raid_id", id)
      .overrideTypes<
        {
          character_id: string;
          status: SignupStatus;
          spec_id: string | null;
          note: string | null;
          characters: CharacterJoin | null;
        }[],
        { merge: false }
      >(),
    supabase
      .from("comp_slots")
      .select(`split_no, group_no, position, character_id, spec_id, role, characters(${CHARACTER})`)
      .eq("raid_id", id)
      .overrideTypes<
        {
          split_no: number;
          group_no: number;
          position: number;
          character_id: string;
          spec_id: string | null;
          role: Role | null;
          characters: CharacterJoin | null;
        }[],
        { merge: false }
      >(),
    supabase.from("raid_duties").select("split_no, duty, character_id").eq("raid_id", id),
    supabase.from("classes").select("id, name, color"),
    supabase.from("specs").select("id, name, roles"),
    supabase
      .from("comp_slots")
      .select("raids!inner(id, title, starts_at), characters!inner(owner_id)")
      .neq("raid_id", id)
      .gte("raids.starts_at", new Date(start - window).toISOString())
      .lte("raids.starts_at", new Date(start + window).toISOString())
      .overrideTypes<{ raids: { id: string; title: string }; characters: { owner_id: string } }[], { merge: false }>(),
    supabase.from("instances").select("name, size, tanks, healers, dps").eq("name", raid.instance).maybeSingle(),
    supabase.from("split_rosters").select("character_id, split_no").eq("instance", raid.instance),
    // For auto-fill, which ranks contested spots by attendance.
    isOfficer
      ? supabase
          .from("attendance")
          .select("status, raid_id, raids(title, starts_at), characters(owner_id)")
          .overrideTypes<AttendanceRow[], { merge: false }>()
      : Promise.resolve({ data: [] as AttendanceRow[] }),
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));
  const elsewhere = new Map(nearby?.map((n) => [n.characters.owner_id, n.raids.title]));
  const rosterSplit = new Map(roster?.map((r) => [r.character_id, r.split_no]));
  const { raids: recordedRaids, byPlayer } = attendanceByPlayer(attendanceRows ?? []);
  const attendanceOf = (ch: CharacterJoin) =>
    attendanceSummary(recordedRaids, byPlayer.get(ch.owner_id) ?? new Map(), ch.profiles?.created_at ?? "").pct;

  const characters: Record<string, BoardCharacter> = {};
  const addCharacter = (ch: CharacterJoin, specId: string | null, status: SignupStatus | null, note: string | null) => {
    const resolvedSpecId = specId ?? ch.main_spec_id;
    const spec = specById.get(resolvedSpecId);
    const cls = classById.get(ch.class_id);
    characters[ch.id] = {
      id: ch.id,
      name: ch.name,
      player: ch.profiles?.display_name ?? "",
      color: cls?.color ?? "#ccc",
      className: cls?.name ?? "",
      classId: ch.class_id,
      specId: resolvedSpecId,
      specName: spec?.name ?? "",
      role: primaryRole(spec),
      roles: (spec?.roles ?? []) as Role[],
      options: roleOptions([resolvedSpecId, ch.main_spec_id, ...ch.off_spec_ids], specById),
      status,
      note,
      elsewhere: elsewhere.get(ch.owner_id) ?? null,
      rosterSplit: rosterSplit.get(ch.id) ?? null,
      isMain: ch.is_main,
      attendance: isOfficer ? attendanceOf(ch) : null,
    };
  };
  const signupOf = new Map(signups?.map((s) => [s.character_id, s]));
  for (const s of signups ?? []) if (s.characters) addCharacter(s.characters, s.spec_id, s.status, s.note);
  for (const slot of slots ?? []) {
    if (!slot.characters) continue;
    const signup = signupOf.get(slot.character_id);
    const signupSpec = specById.get(signup?.spec_id ?? slot.characters.main_spec_id);
    // Placed in an offspec (auto-fill switching a dps to healer, say): show that spec. Otherwise the signed-up
    // spec, which follows the player changing their sign-up.
    const offspec = !!slot.role && !!slot.spec_id && !signupSpec?.roles.includes(slot.role);
    addCharacter(
      slot.characters,
      offspec ? slot.spec_id : (signup?.spec_id ?? slot.spec_id),
      signup?.status ?? null,
      signup?.note ?? null,
    );
  }

  const placement: Record<string, string> = {};
  const slotRoles: Record<string, Role> = {};
  for (const slot of slots ?? []) {
    placement[`${slot.split_no}-${slot.group_no}-${slot.position}`] = slot.character_id;
    if (slot.role) slotRoles[slot.character_id] = slot.role;
  }

  // One Gargul roster per split, each with its own groups 1 to N.
  const splitNos = Array.from({ length: raid.splits }, (_, i) => i + 1);
  const groupsExports = splitNos.map((splitNo) => {
    const inSplit = (slots ?? []).filter((slot) => slot.split_no === splitNo);
    const text = gargulGroups(
      inSplit.flatMap((slot) => {
        const ch = characters[slot.character_id];
        if (!ch) return [];
        const role = slot.role ?? ch.role;
        return [{ groupNo: slot.group_no, position: slot.position, name: ch.name, tank: role === "tank" }];
      }),
    );
    return { splitNo, count: inSplit.length, text };
  });
  // Officers get every split's roster; a split's raid lead gets their own.
  const visibleExports = groupsExports.filter((e) => e.count > 0 && (isOfficer || leading.has(e.splitNo)));

  const dutyMap: Record<number, Partial<Record<RaidDuty, string>>> = {};
  for (const d of duties ?? []) dutyMap[d.split_no] = { ...dutyMap[d.split_no], [d.duty as RaidDuty]: d.character_id };
  const lastSplitUsed =
    (slots ?? []).some((s) => s.split_no === raid.splits) || (duties ?? []).some((d) => d.split_no === raid.splits);

  return (
    <div className="space-y-6">
      {isOfficer && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-70">
            {raid.splits > 1
              ? `${raid.splits} splits of ${raid.size}, at the same time.`
              : "Running several groups of this instance tonight?"}
          </span>
          {raid.splits < MAX_SPLITS && (
            <form action={setSplits.bind(null, raid.id, raid.splits + 1)}>
              <button className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/5">
                Add split
              </button>
            </form>
          )}
          {raid.splits > 1 && (
            <form action={setSplits.bind(null, raid.id, raid.splits - 1)}>
              {lastSplitUsed ? (
                <ConfirmButton
                  message={`Remove split ${raid.splits}? Its players go back to the bench and its duties are cleared.`}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/5"
                >
                  Remove split {raid.splits}
                </ConfirmButton>
              ) : (
                <button className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/5">
                  Remove split {raid.splits}
                </button>
              )}
            </form>
          )}
        </div>
      )}

      <CompBoard
        raidId={raid.id}
        size={raid.size}
        splits={raid.splits}
        characters={characters}
        placement={placement}
        slotRoles={slotRoles}
        requirements={requirementsOf(instance)}
        duties={dutyMap}
        canEdit={isOfficer}
      />

      {visibleExports.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-panel/90 p-4 text-sm">
          <h2 className="font-sans font-semibold">Invites and groups</h2>
          <p className="opacity-70">
            {visibleExports.reduce((n, e) => n + e.count, 0)} players. In game, type <code>/gl groups</code> (Gargul)
            and paste the copied roster. From there you can invite everyone, see who&apos;s missing, sort the groups and
            assign the tanks.
            {raid.splits > 1 && isOfficer && " Each split's raid lead can copy their own split here too."}
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleExports.map((e) => (
              <CopyButton
                key={e.splitNo}
                text={e.text}
                className="rounded bg-accent px-3 py-1 font-medium text-accent-foreground hover:bg-accent-hover"
              >
                {raid.splits > 1 ? `Copy split ${e.splitNo} for Gargul` : "Copy for Gargul"}
              </CopyButton>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
