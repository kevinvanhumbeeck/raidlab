"use server";

import { revalidatePath } from "next/cache";
import { officersFromDiscord } from "@/lib/discord";
import { requireViewer } from "@/lib/viewer";
import { INSTANCE_SIZES, MAX_SPLITS } from "@/lib/wow";

export async function setOfficer(profileId: string, value: boolean) {
  if (officersFromDiscord()) throw new Error("Officers follow the @officer role in Discord");
  const { supabase } = await requireViewer();
  const { error } = await supabase.rpc("set_officer", { target: profileId, value });
  if (error) throw new Error(error.message);
  revalidatePath("/manage");
}

// Admins (#87) are managed here only, never from Discord.
export async function setAdmin(profileId: string, value: boolean) {
  const { supabase } = await requireViewer();
  const { error } = await supabase.rpc("set_admin", { target: profileId, value });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setMember(profileId: string, value: boolean) {
  const { supabase } = await requireViewer();
  const { error } = await supabase.rpc("set_member", { target: profileId, value });
  if (error) throw new Error(error.message);
  revalidatePath("/manage");
}

// Instance settings: size, tanks, healers and reserves per player. DPS is generated: the rest of the raid.
// Form fields: name, size, tanks, healers, reserves.
function readInstance(formData: FormData) {
  const num = (key: string) => {
    const value = formData.get(key);
    const n = value === null || value === "" ? NaN : Number(value);
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${key}`);
    return n;
  };
  const size = num("size");
  if (!INSTANCE_SIZES.includes(size)) throw new Error(`Size must be ${INSTANCE_SIZES.join(", ")}`);
  const fields = { size, tanks: num("tanks"), healers: num("healers"), reserves: num("reserves") };
  if (fields.tanks + fields.healers > size) {
    throw new Error("Tanks and healers add up to more than the raid size");
  }
  return fields;
}

export async function saveInstance(formData: FormData) {
  const { supabase, isAdmin } = await requireViewer();
  if (!isAdmin) throw new Error("Only admins can change instances");

  const { error } = await supabase
    .from("instances")
    .update(readInstance(formData))
    .eq("name", String(formData.get("name")));
  if (error) throw new Error(error.message);
  revalidatePath("/manage");
}

export async function addInstance(formData: FormData) {
  const { supabase, isAdmin } = await requireViewer();
  if (!isAdmin) throw new Error("Only admins can add instances");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Enter an instance name");

  const { data: last } = await supabase.from("instances").select("sort").order("sort", { ascending: false }).limit(1);
  const { error } = await supabase
    .from("instances")
    .insert({ name, ...readInstance(formData), sort: (last?.[0]?.sort ?? 0) + 1 });
  if (error?.code === "23505") throw new Error(`${name} already exists`);
  if (error) throw new Error(error.message);
  revalidatePath("/manage");
}

// Put a character in an instance's standing split roster (#60), or take them out (null).
export async function setRosterSplit(instance: string, characterId: string, splitNo: number | null) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can change split rosters");
  if (splitNo !== null && (!Number.isInteger(splitNo) || splitNo < 1 || splitNo > MAX_SPLITS)) {
    throw new Error("Invalid split");
  }

  const { error } = splitNo
    ? await supabase.from("split_rosters").upsert({ instance, character_id: characterId, split_no: splitNo })
    : await supabase.from("split_rosters").delete().eq("instance", instance).eq("character_id", characterId);
  if (error) throw new Error(error.message);
  revalidatePath("/manage/splits/[instance]", "page");
  revalidatePath("/raids/[slug]", "layout");
}
