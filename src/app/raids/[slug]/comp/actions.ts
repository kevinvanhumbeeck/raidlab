"use server";

import { revalidatePath } from "next/cache";
import { requireRaidEditor } from "@/lib/raid";
import type { FilledSlot } from "@/lib/auto-fill";
import { MAX_SPLITS, RAID_DUTIES, ROLES, type RaidDuty, type Role } from "@/lib/wow";

async function requireOfficer(raidId: string) {
  const { supabase } = await requireRaidEditor(raidId, "Only officers can edit compositions");
  return supabase;
}

// Place a character in a slot. If the slot is taken, the two swap places
// (or the occupant goes back to the pool when the dragged character came from it). Works across splits.
export async function moveToSlot(
  raidId: string,
  characterId: string,
  splitNo: number,
  groupNo: number,
  position: number,
) {
  const supabase = await requireOfficer(raidId);

  const [{ data: occupant }, { data: source }, { data: signup }] = await Promise.all([
    supabase
      .from("comp_slots")
      .select("character_id, spec_id, role")
      .eq("raid_id", raidId)
      .eq("split_no", splitNo)
      .eq("group_no", groupNo)
      .eq("position", position)
      .maybeSingle(),
    supabase
      .from("comp_slots")
      .select("split_no, group_no, position, spec_id, role")
      .eq("raid_id", raidId)
      .eq("character_id", characterId)
      .maybeSingle(),
    supabase.from("signups").select("spec_id").eq("raid_id", raidId).eq("character_id", characterId).maybeSingle(),
  ]);
  if (occupant?.character_id === characterId) return;

  const moving = [characterId, ...(occupant ? [occupant.character_id] : [])];
  const { error: deleteError } = await supabase
    .from("comp_slots")
    .delete()
    .eq("raid_id", raidId)
    .in("character_id", moving);
  if (deleteError) throw deleteError;

  // Keep each character's chosen role when they move.
  const inserts = [
    {
      raid_id: raidId,
      split_no: splitNo,
      group_no: groupNo,
      position,
      character_id: characterId,
      // A placed character keeps the spec they were placed with (an offspec, say).
      spec_id: source?.spec_id ?? signup?.spec_id ?? null,
      role: source?.role ?? null,
    },
  ];
  if (occupant && source) {
    inserts.push({
      raid_id: raidId,
      split_no: source.split_no,
      group_no: source.group_no,
      position: source.position,
      character_id: occupant.character_id,
      spec_id: occupant.spec_id,
      role: occupant.role,
    });
  }
  const { error } = await supabase.from("comp_slots").insert(inserts);
  if (error) throw error;

  // Duties belong to a split, so they don't follow someone into another one.
  for (const slot of inserts) {
    const { error: dutyError } = await supabase
      .from("raid_duties")
      .delete()
      .eq("raid_id", raidId)
      .eq("character_id", slot.character_id)
      .neq("split_no", slot.split_no);
    if (dutyError) throw dutyError;
  }

  revalidatePath("/raids/[slug]", "layout");
}

// Set the role a placed hybrid fills (null = the spec's primary role).
export async function setSlotRole(raidId: string, characterId: string, role: Role | null) {
  const supabase = await requireOfficer(raidId);

  if (role) {
    if (!ROLES.includes(role)) throw new Error("Unknown role");
    const { data: slot } = await supabase
      .from("comp_slots")
      .select("spec_id, characters(main_spec_id)")
      .eq("raid_id", raidId)
      .eq("character_id", characterId)
      .single()
      .overrideTypes<{ spec_id: string | null; characters: { main_spec_id: string } | null }, { merge: false }>();
    const specId = slot?.spec_id ?? slot?.characters?.main_spec_id;
    const { data: spec } = await supabase
      .from("specs")
      .select("roles")
      .eq("id", specId ?? "")
      .single();
    if (!spec?.roles.includes(role)) throw new Error("This spec can't fill that role");
  }

  const { error } = await supabase
    .from("comp_slots")
    .update({ role })
    .eq("raid_id", raidId)
    .eq("character_id", characterId);
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
}

export async function removeFromComp(raidId: string, characterId: string) {
  const supabase = await requireOfficer(raidId);
  const { error } = await supabase.from("comp_slots").delete().eq("raid_id", raidId).eq("character_id", characterId);
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
}

// Each split has its own raid lead, assists and loot lead.
export async function setDuty(raidId: string, splitNo: number, duty: RaidDuty, characterId: string | null) {
  const supabase = await requireOfficer(raidId);
  if (!RAID_DUTIES.includes(duty)) throw new Error("Unknown duty");

  const { error } = characterId
    ? await supabase.from("raid_duties").upsert({ raid_id: raidId, split_no: splitNo, duty, character_id: characterId })
    : await supabase.from("raid_duties").delete().eq("raid_id", raidId).eq("split_no", splitNo).eq("duty", duty);
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
}

// Add a split to the night, or remove the last one (#60). Its players go back to the bench and its duties are cleared.
export async function setSplits(raidId: string, splits: number) {
  const supabase = await requireOfficer(raidId);
  if (!Number.isInteger(splits) || splits < 1 || splits > MAX_SPLITS) throw new Error("Invalid number of splits");

  for (const table of ["comp_slots", "raid_duties"] as const) {
    const { error } = await supabase.from(table).delete().eq("raid_id", raidId).gt("split_no", splits);
    if (error) throw error;
  }
  const { error } = await supabase.from("raids").update({ splits }).eq("id", raidId);
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}

// Save an auto-fill draft (#55). It only fills empty slots, so if someone changed the comp in the meantime the
// insert fails as a whole and the officer runs auto-fill again.
export async function applyAutoFill(raidId: string, slots: FilledSlot[]) {
  const supabase = await requireOfficer(raidId);
  if (!slots.length) return;

  const ids = slots.map((s) => s.characterId);
  const [{ data: signups }, { data: characters }, { data: specs }] = await Promise.all([
    supabase
      .from("signups")
      .select("character_id")
      .eq("raid_id", raidId)
      .eq("status", "accepted")
      .in("character_id", ids),
    supabase.from("characters").select("id, main_spec_id, off_spec_ids").in("id", ids),
    supabase.from("specs").select("id, roles"),
  ]);
  const accepted = new Set(signups?.map((s) => s.character_id));
  const characterById = new Map(characters?.map((c) => [c.id, c]));
  const rolesOf = new Map(specs?.map((s) => [s.id, s.roles as string[]]));
  for (const slot of slots) {
    const ch = characterById.get(slot.characterId);
    if (!accepted.has(slot.characterId) || !ch) throw new Error("Only accepted sign-ups can be placed");
    const ownSpec = slot.specId === ch.main_spec_id || ch.off_spec_ids.includes(slot.specId);
    if (!ownSpec || !rolesOf.get(slot.specId)?.includes(slot.role)) throw new Error("Invalid spec or role");
  }

  const { error } = await supabase.from("comp_slots").insert(
    slots.map((s) => ({
      raid_id: raidId,
      split_no: s.splitNo,
      group_no: s.groupNo,
      position: s.position,
      character_id: s.characterId,
      spec_id: s.specId,
      role: s.role,
    })),
  );
  if (error?.code === "23505") throw new Error("The comp changed in the meantime. Run auto-fill again.");
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
}

// Empty the comp, or one split of it. Duties stay.
export async function clearComp(raidId: string, splitNo: number | null) {
  const supabase = await requireOfficer(raidId);
  let query = supabase.from("comp_slots").delete().eq("raid_id", raidId);
  if (splitNo) query = query.eq("split_no", splitNo);
  const { error } = await query;
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
}
