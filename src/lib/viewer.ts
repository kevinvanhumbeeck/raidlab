import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The logged-in player and their profile; redirects home when logged out.
export async function requireViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_officer")
    .eq("id", user.id)
    .single();

  return { supabase, user, isOfficer: profile?.is_officer ?? false, profile };
}
