"use client";

import { useRef, useState } from "react";

// Filters the loot list by item name. Rows carry data-item-name, boss sections data-boss.
export function LootFilter({ children }: { children: React.ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const filter = (value: string) => {
    setQuery(value);
    const q = value.trim().toLowerCase();
    for (const section of list.current?.querySelectorAll<HTMLElement>("[data-boss]") ?? []) {
      let visible = 0;
      for (const row of section.querySelectorAll<HTMLElement>("[data-item-name]")) {
        const match = !q || row.dataset.itemName!.includes(q) || section.dataset.boss!.includes(q);
        row.hidden = !match;
        if (match) visible++;
      }
      section.hidden = visible === 0;
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => filter(e.target.value)}
        placeholder="Search items or bosses"
        className="w-full max-w-sm rounded border border-border bg-background px-2 py-1 text-sm"
      />
      <div ref={list} className="space-y-4">
        {children}
      </div>
    </div>
  );
}
