"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/viewer";
import { RAID_DUTIES, type RaidDuty } from "@/lib/wow";

async function requireOfficer() {
  const viewer = await requireViewer();
  if (!viewer.isOfficer) throw new Error("Only officers can edit compositions");
  return viewer.supabase;
}

// Place a character in a slot. If the slot is taken, the two swap places
// (or the occupant goes back to the pool when the dragged character came from it).
export async function moveToSlot(raidId: string, characterId: string, groupNo: number, position: number) {
  const supabase = await requireOfficer();

  const [{ data: occupant }, { data: source }, { data: signup }] = await Promise.all([
    supabase
      .from("comp_slots")
      .select("character_id, spec_id")
      .eq("raid_id", raidId)
      .eq("group_no", groupNo)
      .eq("position", position)
      .maybeSingle(),
    supabase
      .from("comp_slots")
      .select("group_no, position")
      .eq("raid_id", raidId)
      .eq("character_id", characterId)
      .maybeSingle(),
    supabase
      .from("signups")
      .select("spec_id")
      .eq("raid_id", raidId)
      .eq("character_id", characterId)
      .maybeSingle(),
  ]);
  if (occupant?.character_id === characterId) return;

  const moving = [characterId, ...(occupant ? [occupant.character_id] : [])];
  const { error: deleteError } = await supabase
    .from("comp_slots")
    .delete()
    .eq("raid_id", raidId)
    .in("character_id", moving);
  if (deleteError) throw deleteError;

  const inserts = [
    { raid_id: raidId, group_no: groupNo, position, character_id: characterId, spec_id: signup?.spec_id ?? null },
  ];
  if (occupant && source) {
    inserts.push({
      raid_id: raidId,
      group_no: source.group_no,
      position: source.position,
      character_id: occupant.character_id,
      spec_id: occupant.spec_id,
    });
  }
  const { error } = await supabase.from("comp_slots").insert(inserts);
  if (error) throw error;

  revalidatePath(`/raids/${raidId}/comp`);
}

export async function removeFromComp(raidId: string, characterId: string) {
  const supabase = await requireOfficer();
  const { error } = await supabase
    .from("comp_slots")
    .delete()
    .eq("raid_id", raidId)
    .eq("character_id", characterId);
  if (error) throw error;

  revalidatePath(`/raids/${raidId}/comp`);
}

export async function setDuty(raidId: string, duty: RaidDuty, characterId: string | null) {
  const supabase = await requireOfficer();
  if (!RAID_DUTIES.includes(duty)) throw new Error("Unknown duty");

  const { error } = characterId
    ? await supabase.from("raid_duties").upsert({ raid_id: raidId, duty, character_id: characterId })
    : await supabase.from("raid_duties").delete().eq("raid_id", raidId).eq("duty", duty);
  if (error) throw error;

  revalidatePath(`/raids/${raidId}/comp`);
}
