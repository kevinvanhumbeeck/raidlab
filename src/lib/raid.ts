import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { roleCoverage, roleOptions } from "@/lib/coverage";
import { requireViewer } from "@/lib/viewer";
import {
  FIXED_ROLES,
  RAID_CLOSED_MESSAGE,
  canEditRaid,
  isLocked,
  primaryRole,
  requirementsOf,
  rolesText,
  type RaidDuty,
} from "@/lib/wow";

type Viewer = Awaited<ReturnType<typeof requireViewer>>;
type Supabase = Viewer["supabase"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The raid behind a /raids/[slug] URL. Old links with the raid's UUID redirect to the slug.
export const getRaid = cache(async (slug: string) => {
  const { supabase } = await requireViewer();
  const { data: raid } = await supabase
    .from("raids")
    .select("id, slug, title, instance, size, splits, starts_at, locked_at, pinged_at, notes")
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

// RLS enforces the lock too; this gives players a readable error instead.
export async function assertOpen(supabase: Supabase, raidId: string, message = "Sign-ups are locked") {
  const { data: raid } = await supabase.from("raids").select("starts_at, locked_at").eq("id", raidId).single();
  if (!raid || isLocked(raid)) throw new Error(message);
}

// Whether the viewer changes this raid as an officer: officers until a few days after the start, admins always (#88).
export async function editsAsOfficer(viewer: Viewer, raidId: string) {
  if (viewer.isAdmin) return true;
  if (!viewer.isOfficer) return false;
  const { data: raid } = await viewer.supabase.from("raids").select("starts_at").eq("id", raidId).single();
  return !!raid && canEditRaid(raid, viewer);
}

// For officer actions on a raid. The database enforces the same, but an update or delete it refuses changes nothing
// without an error, so check first.
export async function requireRaidEditor(raidId: string, message: string) {
  const viewer = await requireViewer();
  if (!viewer.isOfficer) throw new Error(message);
  if (!(await editsAsOfficer(viewer, raidId))) throw new Error(RAID_CLOSED_MESSAGE);
  return viewer;
}

// Officers locking sign-ups get asked first when the accepted sign-ups can't fill the tanks and healers, even
// with offspecs (#27). Null when they can.
export async function lockWarning(supabase: Supabase, raid: { id: string; instance: string; splits: number }) {
  const [{ data: signups }, { data: specs }, { data: instance }] = await Promise.all([
    supabase
      .from("signups")
      .select("character_id, spec_id, characters(name, main_spec_id, off_spec_ids)")
      .eq("raid_id", raid.id)
      .eq("status", "accepted")
      .overrideTypes<
        {
          character_id: string;
          spec_id: string | null;
          characters: { name: string; main_spec_id: string; off_spec_ids: string[] } | null;
        }[],
        { merge: false }
      >(),
    supabase.from("specs").select("id, name, roles"),
    supabase.from("instances").select("name, size, tanks, healers, dps").eq("name", raid.instance).maybeSingle(),
  ]);
  const requirements = requirementsOf(instance, raid.splits);
  if (!requirements) return null;

  const specById = new Map(specs?.map((s) => [s.id, s]));
  const players = (signups ?? []).flatMap((s) => {
    const ch = s.characters;
    if (!ch) return [];
    const specId = s.spec_id ?? ch.main_spec_id;
    return [
      {
        id: s.character_id,
        name: ch.name,
        role: primaryRole(specById.get(specId)),
        options: roleOptions([specId, ch.main_spec_id, ...ch.off_spec_ids], specById),
      },
    ];
  });
  const { states } = roleCoverage(players, requirements);
  const short = FIXED_ROLES.filter((role) => states[role] === "short").map((role) => {
    const have = players.filter((p) => p.role === role).length;
    return `${rolesText(have, role)} of ${requirements[role]}`;
  });
  return short.length ? `Only ${short.join(" and ")} signed up, even with offspecs. Lock sign-ups anyway?` : null;
}

// The splits of a raid where the viewer holds a duty, e.g. the raid lead or loot lead of split 2. They get that
// split's Gargul exports without being an officer.
export async function myDutySplits(supabase: Supabase, raidId: string, userId: string, duty: RaidDuty) {
  const { data } = await supabase
    .from("raid_duties")
    .select("split_no, characters!inner(owner_id)")
    .eq("raid_id", raidId)
    .eq("duty", duty)
    .eq("characters.owner_id", userId);
  return new Set((data ?? []).map((d) => d.split_no as number));
}
