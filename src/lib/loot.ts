// Loot tables and soft reserves (#9).

export type LootItem = {
  id: number;
  instance: string;
  boss: string | null;
  name: string;
  quality: number;
  icon: string | null;
};

// In-game item quality colours: poor, common, uncommon, rare, epic, legendary, artifact, heirloom.
export const QUALITY_COLORS = ["#9d9d9d", "#ffffff", "#1eff00", "#0070dd", "#a335ee", "#ff8000", "#e6cc80", "#00ccff"];

export function qualityColor(quality: number) {
  return QUALITY_COLORS[quality] ?? QUALITY_COLORS[1];
}

export function iconUrl(icon: string | null) {
  return `https://wow.zamimg.com/images/wow/icons/medium/${icon ?? "inv_misc_questionmark"}.jpg`;
}

export function wowheadItemUrl(id: number) {
  return `https://www.wowhead.com/forever/item=${id}`;
}

// Item IDs from pasted text: bare IDs or Wowhead links (".../item=2816/death-speaker-scepter"), any separator.
export function parseItemIds(text: string) {
  const ids = new Set<number>();
  for (const token of text.split(/[\s,;]+/)) {
    const match = token.match(/item=(\d+)/) ?? token.match(/^(\d+)$/);
    if (match) ids.add(Number(match[1]));
  }
  return [...ids];
}

// Items grouped by boss, in loot table order.
export function groupByBoss<T extends { boss: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const boss = item.boss ?? "Other";
    groups.set(boss, [...(groups.get(boss) ?? []), item]);
  }
  return [...groups];
}
