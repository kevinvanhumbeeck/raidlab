"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/viewer";

export async function setOfficer(profileId: string, value: boolean) {
  const { supabase } = await requireViewer();
  const { error } = await supabase.rpc("set_officer", { target: profileId, value });
  if (error) throw new Error(error.message);
  revalidatePath("/officers");
}

export async function setMember(profileId: string, value: boolean) {
  const { supabase } = await requireViewer();
  const { error } = await supabase.rpc("set_member", { target: profileId, value });
  if (error) throw new Error(error.message);
  revalidatePath("/officers");
}

// Instance settings: size and minimum players per role. Form fields: name, size, tanks, healers, dps.
function readInstance(formData: FormData) {
  const num = (key: string) => {
    const n = Number(formData.get(key));
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${key}`);
    return n;
  };
  const size = num("size");
  if (![10, 20, 40].includes(size)) throw new Error("Size must be 10, 20 or 40");
  const fields = { size, tanks: num("tanks"), healers: num("healers"), dps: num("dps") };
  if (fields.tanks + fields.healers + fields.dps > size) {
    throw new Error("Requirements add up to more than the raid size");
  }
  return fields;
}

export async function saveInstance(formData: FormData) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can change instances");

  const { error } = await supabase
    .from("instances")
    .update(readInstance(formData))
    .eq("name", String(formData.get("name")));
  if (error) throw new Error(error.message);
  revalidatePath("/officers");
}

export async function addInstance(formData: FormData) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can add instances");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Enter an instance name");

  const { data: last } = await supabase.from("instances").select("sort").order("sort", { ascending: false }).limit(1);
  const { error } = await supabase
    .from("instances")
    .insert({ name, ...readInstance(formData), sort: (last?.[0]?.sort ?? 0) + 1 });
  if (error?.code === "23505") throw new Error(`${name} already exists`);
  if (error) throw new Error(error.message);
  revalidatePath("/officers");
}
