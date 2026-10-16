"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseItemIds } from "@/lib/loot";
import { requireViewer } from "@/lib/viewer";
import { lootTableHref } from "@/lib/wow";

async function requireAdmin() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) throw new Error("Only admins can edit loot tables");
  return viewer.supabase;
}

// Name, quality and icon from Wowhead's Forever item database, or null for unknown items.
async function fetchItemInfo(id: number) {
  const res = await fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}`);
  if (!res.ok) return null;
  const data: { name?: string; quality?: number; icon?: string } = await res.json();
  if (!data.name) return null;
  return { name: data.name, quality: data.quality ?? 1, icon: data.icon ?? null };
}

// Admins paste item IDs or Wowhead links for one boss. Items already in a loot table move here.
export async function addLootItems(instance: string, formData: FormData) {
  const supabase = await requireAdmin();
  const ids = parseItemIds(String(formData.get("items") ?? ""));
  if (!ids.length) throw new Error("Paste item IDs or Wowhead item links");
  const boss = String(formData.get("boss") ?? "").trim() || null;

  const { data: last } = await supabase
    .from("loot_items")
    .select("sort")
    .eq("instance", instance)
    .order("sort", { ascending: false })
    .limit(1);
  const sort = last?.[0]?.sort ?? 0;

  const infos = await Promise.all(ids.map(fetchItemInfo));
  const rows = ids.flatMap((id, i) => {
    const info = infos[i];
    return info ? [{ id, instance, boss, ...info, sort: sort + i + 1 }] : [];
  });
  const missing = ids.filter((_, i) => !infos[i]);

  if (rows.length) {
    const { error } = await supabase.from("loot_items").upsert(rows);
    if (error) throw error;
  }

  revalidatePath(lootTableHref(instance));
  redirect(missing.length ? `${lootTableHref(instance)}?missing=${missing.join(",")}` : lootTableHref(instance));
}

export async function removeLootItem(instance: string, id: number) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("loot_items").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(lootTableHref(instance));
}

// For replacing a stand-in loot table. Removes the reserves on these items too.
export async function clearLootTable(instance: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("loot_items").delete().eq("instance", instance);
  if (error) throw error;
  revalidatePath(lootTableHref(instance));
}
