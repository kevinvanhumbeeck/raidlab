"use server";

import { revalidatePath } from "next/cache";
import { assertOpen, editsAsOfficer, requireRaidEditor } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";

// Players reserve for their own signed-up character until the raid locks; officers for anyone until a few days after
// the start, admins any time.
// The database checks the item, the sign-up and the reserve limit, and its messages are shown as-is.
async function requireReserver(raidId: string, characterId: string) {
  const viewer = await requireViewer();
  const { supabase, user } = viewer;
  if (await editsAsOfficer(viewer, raidId)) return supabase;

  await assertOpen(supabase, raidId, "Reserves are locked");
  const { data: character } = await supabase
    .from("characters")
    .select("id")
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!character) throw new Error("Not your character");
  return supabase;
}

export async function reserveItem(raidId: string, characterId: string, itemId: number) {
  const supabase = await requireReserver(raidId, characterId);
  const { error } = await supabase
    .from("reserves")
    .insert({ raid_id: raidId, character_id: characterId, item_id: itemId });
  if (error?.code === "23505") return;
  if (error?.code === "23503") throw new Error("Sign up for this raid first");
  if (error) throw new Error(error.message);
  revalidatePath("/raids/[slug]", "layout");
}

export async function unreserveItem(raidId: string, characterId: string, itemId: number) {
  const supabase = await requireReserver(raidId, characterId);
  const { error } = await supabase
    .from("reserves")
    .delete()
    .eq("raid_id", raidId)
    .eq("character_id", characterId)
    .eq("item_id", itemId);
  if (error) throw error;
  revalidatePath("/raids/[slug]", "layout");
}

// Officers keep items out of rolls; the database drops the soft reserves on them.
async function requireOfficer(raidId: string) {
  const { supabase } = await requireRaidEditor(raidId, "Only officers can hard-reserve items");
  return supabase;
}

export async function hardReserveItem(raidId: string, itemId: number) {
  const supabase = await requireOfficer(raidId);
  const { error } = await supabase.from("hard_reserves").insert({ raid_id: raidId, item_id: itemId });
  if (error?.code === "23505") return;
  if (error) throw new Error(error.message);
  revalidatePath("/raids/[slug]", "layout");
}

export async function unhardReserveItem(raidId: string, itemId: number) {
  const supabase = await requireOfficer(raidId);
  const { error } = await supabase.from("hard_reserves").delete().eq("raid_id", raidId).eq("item_id", itemId);
  if (error) throw error;
  revalidatePath("/raids/[slug]", "layout");
}
