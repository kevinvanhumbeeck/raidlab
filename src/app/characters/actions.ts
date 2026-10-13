"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addCharacter(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const mainSpecId = String(formData.get("main_spec_id"));
  const { data: spec } = await supabase.from("specs").select("class_id").eq("id", mainSpecId).single();
  if (!spec) throw new Error("Unknown spec");

  const { data: classSpecs } = await supabase.from("specs").select("id").eq("class_id", spec.class_id);
  const allowed = new Set(classSpecs?.map((s) => s.id));
  const offSpecIds = formData
    .getAll("off_spec_ids")
    .map(String)
    .filter((id) => id !== mainSpecId && allowed.has(id));

  const { error } = await supabase.from("characters").insert({
    owner_id: user.id,
    name: String(formData.get("name")).trim(),
    class_id: spec.class_id,
    main_spec_id: mainSpecId,
    off_spec_ids: offSpecIds,
    is_main: formData.get("is_main") === "on",
  });
  if (error) throw error;
  revalidatePath("/characters");
}

export async function deleteCharacter(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("characters").delete().eq("id", String(formData.get("id")));
  if (error) throw error;
  revalidatePath("/characters");
}
