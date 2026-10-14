import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The logged-in player and their profile, or nulls when logged out.
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, isOfficer: false, isMember: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, slug, display_name, avatar_url, is_officer, is_member")
    .eq("id", user.id)
    .single();

  const isOfficer = profile?.is_officer ?? false;
  return { supabase, user, profile, isOfficer, isMember: isOfficer || (profile?.is_member ?? false) };
});

// For member-only pages: redirects home when logged out or not in the Discord server.
export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer.user || !viewer.isMember) redirect("/");
  return { ...viewer, user: viewer.user };
}
