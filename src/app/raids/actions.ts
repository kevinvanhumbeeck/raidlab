"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { SIGNUP_STATUSES, isLocked, type SignupStatus } from "@/lib/wow";

type Supabase = Awaited<ReturnType<typeof requireViewer>>["supabase"];

const OUT_OF_COMP: SignupStatus[] = ["bench", "absent"];

export async function createRaid(formData: FormData) {
  const { supabase, user, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can create raids");

  const { data: instance } = await supabase
    .from("instances")
    .select("name, size")
    .eq("name", String(formData.get("instance")))
    .maybeSingle();
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
    .select("slug")
    .single();
  if (error) throw error;

  revalidatePath("/raids");
  redirect(`/raids/${data.slug}`);
}

export async function deleteRaid(raidId: string) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can delete raids");

  const { error } = await supabase.from("raids").delete().eq("id", raidId);
  if (error) throw error;

  revalidatePath("/raids");
  redirect("/raids");
}

// Officers lock a raid now, or reopen it. Reopening clears locked_at, so it doesn't lock again at the start.
export async function setRaidLock(raidId: string, locked: boolean) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can lock raids");

  const { error } = await supabase
    .from("raids")
    .update({ locked_at: locked ? new Date().toISOString() : null })
    .eq("id", raidId);
  if (error) throw error;

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}

// RLS enforces the lock too; this gives players a readable error instead.
async function assertOpen(supabase: Supabase, raidId: string) {
  const { data: raid } = await supabase.from("raids").select("locked_at").eq("id", raidId).single();
  if (!raid || isLocked(raid)) throw new Error("Sign-ups are locked");
}

// A player signs up with one of their characters. Signing up with another
// character replaces the previous sign-up, so each player appears once per raid.
export async function signUp(raidId: string, formData: FormData) {
  const { supabase, user, isOfficer } = await requireViewer();
  if (!isOfficer) await assertOpen(supabase, raidId);

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
  if (OUT_OF_COMP.includes(status)) await dropFromComp(supabase, raidId, character.id);

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}

// An officer benching or removing a placed player takes them out of the comp too. When players change
// their own sign-up they stay placed, and the comp page flags them for an officer to decide.
async function dropFromComp(supabase: Supabase, raidId: string, characterId: string) {
  const { error } = await supabase.from("comp_slots").delete().eq("raid_id", raidId).eq("character_id", characterId);
  if (error) throw error;
}

export async function withdraw(raidId: string, characterId: string) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) await assertOpen(supabase, raidId);
  const { error } = await supabase
    .from("signups")
    .delete()
    .eq("raid_id", raidId)
    .eq("character_id", characterId);
  if (error) throw error;
  if (isOfficer) await dropFromComp(supabase, raidId, characterId);

  revalidatePath("/raids/[slug]", "layout");
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
  if (OUT_OF_COMP.includes(status)) await dropFromComp(supabase, raidId, characterId);

  revalidatePath("/raids/[slug]", "layout");
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

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}
