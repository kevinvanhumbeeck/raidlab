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
