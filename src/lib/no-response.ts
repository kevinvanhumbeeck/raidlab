import type { SupabaseClient } from "@supabase/supabase-js";
import { primaryRole, type Role } from "@/lib/wow";

// Minutes between two pings of the same raid, so a double click doesn't mention everyone twice.
export const PING_COOLDOWN_MINUTES = 10;

// Members who haven't responded to a raid (#58): no sign-up, accepted or declined, on any of their characters.
// Each is shown as their main character. Until raiders and pugs are told apart (#82), every member counts.
export type Missing = {
  id: string;
  slug: string;
  displayName: string;
  discordId: string | null;
  // Whether they get the reminder DM (#59).
  discordDms: boolean;
  character: { name: string; color: string } | null;
  // Null for members without a character.
  role: Role | null;
};

// Works with the officer's client and with the admin client (for the reminders, #59).
export async function noResponse(supabase: SupabaseClient, raidId: string): Promise<Missing[]> {
  const [{ data: profiles }, { data: characters }, { data: signups }, { data: specs }, { data: classes }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, slug, display_name, discord_id, discord_dms")
        .or("is_member.eq.true,is_officer.eq.true"),
      supabase
        .from("characters")
        .select("id, owner_id, name, class_id, main_spec_id")
        .order("is_main", { ascending: false })
        .order("created_at"),
      supabase.from("signups").select("character_id").eq("raid_id", raidId),
      supabase.from("specs").select("id, roles"),
      supabase.from("classes").select("id, color"),
    ]);

  const specById = new Map(specs?.map((s) => [s.id, s]));
  const color = new Map(classes?.map((c) => [c.id, c.color as string]));
  const ownerOf = new Map(characters?.map((c) => [c.id, c.owner_id]));
  const responded = new Set((signups ?? []).map((s) => ownerOf.get(s.character_id)));
  // Characters are ordered main first, so the first one per owner is their main.
  const mainOf = new Map<string, NonNullable<typeof characters>[number]>();
  for (const c of characters ?? []) if (!mainOf.has(c.owner_id)) mainOf.set(c.owner_id, c);

  return (profiles ?? [])
    .filter((p) => !responded.has(p.id))
    .map((p) => {
      const main = mainOf.get(p.id);
      return {
        id: p.id,
        slug: p.slug,
        displayName: p.display_name,
        discordId: p.discord_id,
        discordDms: p.discord_dms,
        character: main ? { name: main.name, color: color.get(main.class_id) ?? "#ccc" } : null,
        role: main ? primaryRole(specById.get(main.main_spec_id)) : null,
      };
    })
    .sort((a, b) => (a.character?.name ?? a.displayName).localeCompare(b.character?.name ?? b.displayName));
}
