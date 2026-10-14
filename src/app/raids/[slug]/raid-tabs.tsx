"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

export type RaidTab = { segment: string; label: string; meta: string; warn?: boolean };

export function RaidTabs({ raidSlug, tabs }: { raidSlug: string; tabs: RaidTab[] }) {
  const active = useSelectedLayoutSegment() ?? "";

  return (
    // Scrolls sideways on narrow screens without showing a scrollbar. The bottom line is an inset shadow,
    // so the active tab's underline covers it without overflowing the scroll area vertically.
    <nav className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max min-w-full gap-1 shadow-[inset_0_-1px_0_var(--border)]">
        {tabs.map((tab) => {
          const selected = tab.segment === active;
          return (
            <li key={tab.segment}>
              <Link
                href={tab.segment ? `/raids/${raidSlug}/${tab.segment}` : `/raids/${raidSlug}`}
                aria-current={selected ? "page" : undefined}
                className={`flex items-baseline gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
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
