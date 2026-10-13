import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { formatRaidTime, type RaidDuty, type Role, type SignupStatus } from "@/lib/wow";
import { CompBoard, type BoardCharacter } from "./comp-board";

type CharacterJoin = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  owner_id: string;
  profiles: { display_name: string } | null;
};

export default async function CompPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, isOfficer } = await requireViewer();

  const { data: raid } = await supabase
    .from("raids")
    .select("id, title, instance, size, starts_at")
    .eq("id", id)
    .maybeSingle();
  if (!raid) notFound();

  // Other raids within 6 hours, to flag players already placed in a parallel split.
  const start = new Date(raid.starts_at).getTime();
  const window = 6 * 60 * 60 * 1000;

  const [{ data: signups }, { data: slots }, { data: duties }, { data: classes }, { data: specs }, { data: nearby }] =
    await Promise.all([
      supabase
        .from("signups")
        .select("character_id, status, spec_id, note, characters(id, name, class_id, main_spec_id, owner_id, profiles(display_name))")
        .eq("raid_id", id)
        .overrideTypes<
          { character_id: string; status: SignupStatus; spec_id: string | null; note: string | null; characters: CharacterJoin | null }[],
          { merge: false }
        >(),
      supabase
        .from("comp_slots")
        .select("group_no, position, character_id, spec_id, characters(id, name, class_id, main_spec_id, owner_id, profiles(display_name))")
        .eq("raid_id", id)
        .overrideTypes<
          { group_no: number; position: number; character_id: string; spec_id: string | null; characters: CharacterJoin | null }[],
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
      role: (spec?.roles[0] ?? "melee") as Role,
      status,
      note,
      elsewhere: elsewhere.get(ch.owner_id) ?? null,
    };
  };
  for (const slot of slots ?? []) if (slot.characters) addCharacter(slot.characters, slot.spec_id, null, null);
  for (const s of signups ?? []) if (s.characters) addCharacter(s.characters, s.spec_id, s.status, s.note);

  const placement: Record<string, string> = {};
  for (const slot of slots ?? []) placement[`${slot.group_no}-${slot.position}`] = slot.character_id;

  const dutyMap: Partial<Record<RaidDuty, string>> = {};
  for (const d of duties ?? []) dutyMap[d.duty as RaidDuty] = d.character_id;

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <Link href={`/raids/${raid.id}`} className="text-sm opacity-70 hover:opacity-100">
          ← Sign-ups
        </Link>
        <h1 className="text-2xl font-semibold">{raid.title} — composition</h1>
        <p className="opacity-80">
          {raid.instance} · {raid.size}-man · {formatRaidTime(raid.starts_at)} server time
        </p>
      </section>
      <CompBoard
        raidId={raid.id}
        size={raid.size}
        characters={characters}
        placement={placement}
        duties={dutyMap}
        canEdit={isOfficer}
      />
    </div>
  );
}
