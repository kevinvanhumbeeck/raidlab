import { CopyButton } from "@/components/copy-button";
import { roleOptions } from "@/lib/coverage";
import { gargulGroups } from "@/lib/gargul";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { primaryRole, requirementsOf, type RaidDuty, type Role, type SignupStatus } from "@/lib/wow";
import { CompBoard, type BoardCharacter } from "./comp-board";

type CharacterJoin = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  off_spec_ids: string[];
  owner_id: string;
  profiles: { display_name: string } | null;
};

export default async function CompPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { id } = raid;
  const { supabase, isOfficer } = await requireViewer();

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
  ] = await Promise.all([
    supabase
      .from("signups")
      .select(
        "character_id, status, spec_id, note, characters(id, name, class_id, main_spec_id, off_spec_ids, owner_id, profiles(display_name))",
      )
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
      .select(
        "group_no, position, character_id, spec_id, role, characters(id, name, class_id, main_spec_id, off_spec_ids, owner_id, profiles(display_name))",
      )
      .eq("raid_id", id)
      .overrideTypes<
        {
          group_no: number;
          position: number;
          character_id: string;
          spec_id: string | null;
          role: Role | null;
          characters: CharacterJoin | null;
        }[],
        { merge: false }
      >(),
    supabase.from("raid_duties").select("duty, character_id").eq("raid_id", id),
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
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));
  const elsewhere = new Map(nearby?.map((n) => [n.characters.owner_id, n.raids.title]));

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
    };
  };
  for (const slot of slots ?? []) if (slot.characters) addCharacter(slot.characters, slot.spec_id, null, null);
  for (const s of signups ?? []) if (s.characters) addCharacter(s.characters, s.spec_id, s.status, s.note);

  const placement: Record<string, string> = {};
  const slotRoles: Record<string, Role> = {};
  for (const slot of slots ?? []) {
    placement[`${slot.group_no}-${slot.position}`] = slot.character_id;
    if (slot.role) slotRoles[slot.character_id] = slot.role;
  }

  const groupsExport = gargulGroups(
    (slots ?? []).flatMap((slot) => {
      const ch = characters[slot.character_id];
      if (!ch) return [];
      const role = slot.role ?? ch.role;
      return [{ groupNo: slot.group_no, position: slot.position, name: ch.name, tank: role === "tank" }];
    }),
  );

  const dutyMap: Partial<Record<RaidDuty, string>> = {};
  for (const d of duties ?? []) dutyMap[d.duty as RaidDuty] = d.character_id;

  return (
    <div className="space-y-6">
      <CompBoard
        raidId={raid.id}
        size={raid.size}
        characters={characters}
        placement={placement}
        slotRoles={slotRoles}
        requirements={requirementsOf(instance)}
        duties={dutyMap}
        canEdit={isOfficer}
      />

      {isOfficer && (slots ?? []).length > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-panel/90 p-4 text-sm">
          <h2 className="font-sans font-semibold">Invites and groups</h2>
          <p className="opacity-70">
            {(slots ?? []).length} players in the comp. In game, type <code>/gl groups</code> (Gargul) and paste
            the copied roster. From there you can invite everyone, see who&apos;s missing, sort the groups and
            assign the tanks.
          </p>
          <CopyButton
            text={groupsExport}
            className="rounded bg-accent px-3 py-1 font-medium text-accent-foreground hover:bg-accent-hover"
          >
            Copy for Gargul
          </CopyButton>
        </section>
      )}
    </div>
  );
}
