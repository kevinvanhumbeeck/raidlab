"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/viewer";

export type CharacterFormState = { error: string | null; saved: number };

// Adds a character, or updates it when the form has an id. Class can't change after creation.
// A player has one main: marking a character as main turns their other characters into alts.
export async function saveCharacter(prev: CharacterFormState, formData: FormData): Promise<CharacterFormState> {
  const { supabase, user } = await requireViewer();

  const id = formData.get("id") ? String(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const mainSpecId = String(formData.get("main_spec_id") ?? "");
  if (!name) return { ...prev, error: "Enter a character name." };

  let classId = String(formData.get("class_id") ?? "");
  if (id) {
    const { data: existing } = await supabase.from("characters").select("class_id").eq("id", id).single();
    if (!existing) return { ...prev, error: "Character not found." };
    classId = existing.class_id;
  }

  const { data: classSpecs } = await supabase.from("specs").select("id").eq("class_id", classId);
  const allowed = new Set(classSpecs?.map((s) => s.id));
  if (!allowed.has(mainSpecId)) return { ...prev, error: "Pick a main spec for this class." };

  const offSpecIds = formData
    .getAll("off_spec_ids")
    .map(String)
    .filter((specId) => specId !== mainSpecId && allowed.has(specId));

  const fields = {
    name,
    main_spec_id: mainSpecId,
    off_spec_ids: offSpecIds,
    is_main: formData.get("is_main") === "on",
  };

  const { data: saved, error } = await (id
    ? supabase.from("characters").update(fields).eq("id", id)
    : supabase.from("characters").insert({ ...fields, owner_id: user.id, class_id: classId })
  )
    .select("id")
    .single();

  if (error?.code === "23505") return { ...prev, error: `A character named ${name} is already registered.` };
  if (error) return { ...prev, error: error.message };

  if (fields.is_main) {
    const { error: demoteError } = await supabase
      .from("characters")
      .update({ is_main: false })
      .eq("owner_id", user.id)
      .eq("is_main", true)
      .neq("id", saved.id);
    if (demoteError) return { ...prev, error: demoteError.message };
  }

  revalidatePath("/characters");
  revalidatePath("/");
  return { error: null, saved: prev.saved + 1 };
}

export async function deleteCharacter(formData: FormData) {
  const { supabase } = await requireViewer();
  const { error } = await supabase.from("characters").delete().eq("id", String(formData.get("id")));
  if (error) throw error;
  revalidatePath("/characters");
  revalidatePath("/");
}
