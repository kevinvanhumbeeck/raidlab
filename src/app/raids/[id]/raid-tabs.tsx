"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

export type RaidTab = { segment: string; label: string; meta: string; warn?: boolean };

export function RaidTabs({ raidId, tabs }: { raidId: string; tabs: RaidTab[] }) {
  const active = useSelectedLayoutSegment() ?? "";

  return (
    <nav className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const selected = tab.segment === active;
          return (
            <li key={tab.segment}>
              <Link
                href={tab.segment ? `/raids/${raidId}/${tab.segment}` : `/raids/${raidId}`}
                aria-current={selected ? "page" : undefined}
                className={`-mb-px flex items-baseline gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                  selected ? "border-accent font-medium" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {tab.label}
                <span className={`text-xs tabular-nums ${tab.warn ? "text-amber-400" : "opacity-60"}`}>{tab.meta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
