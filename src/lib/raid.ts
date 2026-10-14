import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The raid behind a /raids/[slug] URL. Old links with the raid's UUID redirect to the slug.
export const getRaid = cache(async (slug: string) => {
  const { supabase } = await requireViewer();
  const { data: raid } = await supabase
    .from("raids")
    .select("id, slug, title, instance, size, starts_at, notes")
    .eq(UUID.test(slug) ? "id" : "slug", slug)
    .maybeSingle();
  if (!raid) notFound();
  if (raid.slug !== slug) permanentRedirect(`/raids/${raid.slug}`);
  return raid;
});

// Same for a player's /players/[slug] profile.
export const getPlayer = cache(async (slug: string) => {
  const { supabase } = await requireViewer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, slug, display_name, avatar_url, is_officer, created_at")
    .eq(UUID.test(slug) ? "id" : "slug", slug)
    .maybeSingle();
  if (!profile) notFound();
  if (profile.slug !== slug) permanentRedirect(`/players/${profile.slug}`);
  return profile;
});
