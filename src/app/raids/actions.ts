"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { INSTANCES, SIGNUP_STATUSES, type SignupStatus } from "@/lib/wow";

export async function createRaid(formData: FormData) {
  const { supabase, user, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can create raids");

  const instance = INSTANCES.find((i) => i.name === formData.get("instance"));
  if (!instance) throw new Error("Unknown instance");

  const startsAt = new Date(String(formData.get("starts_at")));
  if (Number.isNaN(startsAt.getTime())) throw new Error("Invalid start time");

  const title = String(formData.get("title") ?? "").trim() || instance.name;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { data, error } = await supabase
    .from("raids")
    .insert({
      title,
      instance: instance.name,
      size: instance.size,
      starts_at: startsAt.toISOString(),
      notes,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/raids");
  redirect(`/raids/${data.id}`);
}

export async function deleteRaid(raidId: string) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can delete raids");

  const { error } = await supabase.from("raids").delete().eq("id", raidId);
  if (error) throw error;

  revalidatePath("/raids");
  redirect("/raids");
}

// A player signs up with one of their characters. Signing up with another
// character replaces the previous sign-up, so each player appears once per raid.
export async function signUp(raidId: string, formData: FormData) {
  const { supabase, user } = await requireViewer();

  const characterId = String(formData.get("character_id"));
  const status = String(formData.get("status")) as SignupStatus;
  if (!SIGNUP_STATUSES.includes(status)) throw new Error("Invalid status");

  const { data: character } = await supabase
    .from("characters")
    .select("id, main_spec_id, off_spec_ids")
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .single();
  if (!character) throw new Error("Not your character");

  const specId = String(formData.get("spec_id"));
  if (specId !== character.main_spec_id && !character.off_spec_ids.includes(specId)) {
    throw new Error("Spec does not belong to this character");
  }

  const { data: myCharacters } = await supabase.from("characters").select("id").eq("owner_id", user.id);
  const otherIds = (myCharacters ?? []).map((c) => c.id).filter((id) => id !== characterId);
  if (otherIds.length) {
    const { error } = await supabase
      .from("signups")
      .delete()
      .eq("raid_id", raidId)
      .in("character_id", otherIds);
    if (error) throw error;
  }

  const { error } = await supabase.from("signups").upsert({
    raid_id: raidId,
    character_id: characterId,
    status,
    spec_id: specId,
    note: String(formData.get("note") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  revalidatePath(`/raids/${raidId}`);
  revalidatePath("/raids");
}

export async function withdraw(raidId: string, characterId: string) {
  const { supabase } = await requireViewer();
  const { error } = await supabase
    .from("signups")
    .delete()
    .eq("raid_id", raidId)
    .eq("character_id", characterId);
  if (error) throw error;

  revalidatePath(`/raids/${raidId}`);
  revalidatePath("/raids");
}

// Officers can move anyone between accepted / tentative / bench / absent.
export async function setSignupStatus(raidId: string, characterId: string, status: SignupStatus) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can change other sign-ups");
  if (!SIGNUP_STATUSES.includes(status)) throw new Error("Invalid status");

  const { error } = await supabase
    .from("signups")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("raid_id", raidId)
    .eq("character_id", characterId);
  if (error) throw error;

  revalidatePath(`/raids/${raidId}`);
}

// Officers can sign up any character, e.g. for players who replied in Discord.
export async function officerSignUp(raidId: string, formData: FormData) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can sign up other players");

  const status = String(formData.get("status")) as SignupStatus;
  if (!SIGNUP_STATUSES.includes(status)) throw new Error("Invalid status");

  const { data: character } = await supabase
    .from("characters")
    .select("id, main_spec_id")
    .eq("id", String(formData.get("character_id")))
    .single();
  if (!character) throw new Error("Unknown character");

  const { error } = await supabase.from("signups").upsert({
    raid_id: raidId,
    character_id: character.id,
    status,
    spec_id: character.main_spec_id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  revalidatePath(`/raids/${raidId}`);
  revalidatePath("/raids");
}
