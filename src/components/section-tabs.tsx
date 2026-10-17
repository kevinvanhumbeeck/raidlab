"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  CalendarCheck,
  Castle,
  ClipboardList,
  Gem,
  History,
  LayoutDashboard,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

// Icon components can't be passed as props from a server layout, so tabs name theirs.
const ICONS = {
  signups: ClipboardList,
  comp: Users,
  loot: Gem,
  attendance: CalendarCheck,
  history: History,
  overview: LayoutDashboard,
  members: UserCog,
  instances: Castle,
} satisfies Record<string, LucideIcon>;

// A tab is active on its own segment ("" for the base page) and on any of its subpages' segments.
export type SectionTab = {
  segment: string;
  icon: keyof typeof ICONS;
  label: string;
  meta: string;
  warn?: boolean;
  subpages?: string[];
};

// The tab bar under a raid's or the Manage pages' header.
export function SectionTabs({ base, tabs }: { base: string; tabs: SectionTab[] }) {
  const active = useSelectedLayoutSegment() ?? "";

  return (
    // Scrolls sideways on narrow screens without showing a scrollbar. The bottom line is an inset shadow,
    // so the active tab's underline covers it without overflowing the scroll area vertically.
    <nav className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max min-w-full gap-1 shadow-[inset_0_-1px_0_var(--border)]">
        {tabs.map((tab) => {
          const selected = tab.segment === active || !!tab.subpages?.includes(active);
          const Icon = ICONS[tab.icon];
          return (
            <li key={tab.segment}>
              <Link
                href={tab.segment ? `${base}/${tab.segment}` : base}
                aria-current={selected ? "page" : undefined}
                title={tab.label}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                  selected ? "border-accent font-medium" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {/* Icon only on phones; the label stays readable for screen readers. */}
                <span className="sr-only sm:not-sr-only">{tab.label}</span>
                {tab.meta && (
                  <span className={`text-xs tabular-nums ${tab.warn ? "text-warn" : "opacity-60"}`}>{tab.meta}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
