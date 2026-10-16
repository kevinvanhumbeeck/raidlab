"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { deleteRaidMessage, mentionInChannel, syncRaidMessage } from "@/lib/discord-bot";
import { PING_COOLDOWN_MINUTES, noResponse } from "@/lib/no-response";
import { requireViewer } from "@/lib/viewer";
import { assertOpen } from "@/lib/raid";
import { MAX_SPLITS, SIGNUP_STATUSES, isLocked, type SignupStatus } from "@/lib/wow";

type Supabase = Awaited<ReturnType<typeof requireViewer>>["supabase"];

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
  // Several groups of the instance at the same time (#60).
  const splits = Number(formData.get("splits") ?? 1);
  if (!Number.isInteger(splits) || splits < 1 || splits > MAX_SPLITS) throw new Error("Invalid number of splits");

  const { data, error } = await supabase
    .from("raids")
    .insert({
      title,
      instance: instance.name,
      size: instance.size,
      splits,
      starts_at: startsAt.toISOString(),
      notes,
      created_by: user.id,
    })
    .select("id, slug")
    .single();
  if (error) throw error;

  after(() => syncRaidMessage(data.id));
  revalidatePath("/raids");
  redirect(`/raids/${data.slug}`);
}

export async function deleteRaid(raidId: string) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can delete raids");

  const { data: raid } = await supabase.from("raids").select("discord_message_id").eq("id", raidId).single();
  const { error } = await supabase.from("raids").delete().eq("id", raidId);
  if (error) throw error;
  after(() => deleteRaidMessage(raid?.discord_message_id ?? null));

  revalidatePath("/raids");
  redirect("/raids");
}

// Officers lock a raid now, or reopen it. Reopening clears locked_at, so it doesn't lock again before the start.
export async function setRaidLock(raidId: string, locked: boolean) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can lock raids");

  const { error } = await supabase
    .from("raids")
    .update({ locked_at: locked ? new Date().toISOString() : null })
    .eq("id", raidId);
  if (error) throw error;
  after(() => syncRaidMessage(raidId));

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
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
    const { error } = await supabase.from("signups").delete().eq("raid_id", raidId).in("character_id", otherIds);
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
  if (status === "declined") await dropFromComp(supabase, raidId, character.id);
  after(() => syncRaidMessage(raidId));

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}

// Declining, or an officer removing a sign-up, takes the character out of the comp too.
async function dropFromComp(supabase: Supabase, raidId: string, characterId: string) {
  const { error } = await supabase.from("comp_slots").delete().eq("raid_id", raidId).eq("character_id", characterId);
  if (error) throw error;
}

export async function withdraw(raidId: string, characterId: string) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) await assertOpen(supabase, raidId);
  const { error } = await supabase.from("signups").delete().eq("raid_id", raidId).eq("character_id", characterId);
  if (error) throw error;
  if (isOfficer) await dropFromComp(supabase, raidId, characterId);
  after(() => syncRaidMessage(raidId));

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}

// Officers can mark anyone accepted or declined, e.g. for players who replied in Discord.
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
  if (status === "declined") await dropFromComp(supabase, raidId, characterId);
  after(() => syncRaidMessage(raidId));

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
    .select("id, owner_id, main_spec_id")
    .eq("id", String(formData.get("character_id")))
    .single();
  if (!character) throw new Error("Unknown character");

  // Same rule as players signing up themselves: one character per player, so this replaces their other sign-up.
  const { data: playerCharacters } = await supabase.from("characters").select("id").eq("owner_id", character.owner_id);
  const otherIds = (playerCharacters ?? []).map((c) => c.id).filter((id) => id !== character.id);
  if (otherIds.length) {
    const { error } = await supabase.from("signups").delete().eq("raid_id", raidId).in("character_id", otherIds);
    if (error) throw error;
  }

  const { error } = await supabase.from("signups").upsert({
    raid_id: raidId,
    character_id: character.id,
    status,
    spec_id: character.main_spec_id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  after(() => syncRaidMessage(raidId));

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/raids");
}

// Officers mention the members who haven't responded in the Discord raid channel (#58).
export async function pingNoResponse(raidId: string) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can ping players");

  const { data: raid } = await supabase
    .from("raids")
    .select("slug, title, starts_at, locked_at, discord_message_id, pinged_at")
    .eq("id", raidId)
    .single();
  if (!raid) throw new Error("Unknown raid");
  if (isLocked(raid)) throw new Error("Sign-ups are locked");
  if (raid.pinged_at && Date.now() - new Date(raid.pinged_at).getTime() < PING_COOLDOWN_MINUTES * 60_000) {
    throw new Error(`This raid was pinged less than ${PING_COOLDOWN_MINUTES} minutes ago`);
  }

  const ids = (await noResponse(supabase, raidId)).flatMap((m) => (m.discordId ? [m.discordId] : []));
  if (!ids.length) return;
  // Claim the ping first, so two officers clicking at once don't both send it.
  const claim = supabase.from("raids").update({ pinged_at: new Date().toISOString() }).eq("id", raidId);
  const { data: claimed, error } = await (
    raid.pinged_at ? claim.eq("pinged_at", raid.pinged_at) : claim.is("pinged_at", null)
  ).select("id");
  if (error) throw error;
  if (!claimed?.length) return;
  if (!(await mentionInChannel(raid, ids))) {
    await supabase.from("raids").update({ pinged_at: raid.pinged_at }).eq("id", raidId);
    throw new Error("Discord didn't accept the ping, try again later");
  }

  revalidatePath("/raids/[slug]", "layout");
  revalidatePath("/officers");
}

// Officers post a raid to Discord by hand, e.g. one created before the bot was set up, or update its post.
export async function postToDiscord(raidId: string) {
  const { isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can post raids to Discord");
  await syncRaidMessage(raidId);
  revalidatePath("/raids/[slug]", "layout");
}
