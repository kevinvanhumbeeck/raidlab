import { getRaid, lockWarning } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { RAID_CLOSED_MESSAGE, canEditRaid, formatRaidDate, formatRaidTime, hasStarted, isLocked } from "@/lib/wow";
import { setRaidLock } from "../actions";
import { LockButton } from "./lock-button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTabs } from "@/components/section-tabs";

// Shared header and tabs for a raid's sign-ups, composition, loot and attendance pages.
export default async function RaidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { id } = raid;
  const viewer = await requireViewer();
  const { supabase, isOfficer, isAdmin } = viewer;

  const count = (table: "signups" | "comp_slots" | "attendance" | "reserves") =>
    supabase.from(table).select("raid_id", { count: "exact", head: true }).eq("raid_id", id);

  // A split night (#60) has room for every split.
  const capacity = raid.size * raid.splits;
  const started = hasStarted(raid.starts_at);
  const locked = isLocked(raid);
  const canEdit = canEditRaid(raid, viewer);

  const [{ count: accepted }, { count: placed }, { count: recorded }, { count: reserved }, warning] = await Promise.all(
    [
      count("signups").eq("status", "accepted"),
      count("comp_slots"),
      count("attendance"),
      count("reserves"),
      canEdit && !locked ? lockWarning(supabase, raid) : null,
    ],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        {/* The heading says where, the crumb which raid: its own title, or its date when the title is just the instance. */}
        <Breadcrumbs
          items={[
            { label: "Raids", href: "/raids" },
            { label: raid.title === raid.instance ? formatRaidDate(raid.starts_at) : raid.title },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{raid.instance}</h1>
          {locked && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-danger">🔒 Locked</span>
          )}
          {canEdit && !started && (
            <LockButton action={setRaidLock.bind(null, id, !locked)} locked={locked} warning={warning} />
          )}
        </div>
        <p className="opacity-80">
          {raid.size}-man{raid.splits > 1 && ` · ${raid.splits} splits`} · {formatRaidTime(raid.starts_at)} server time
        </p>
        {!locked && raid.locked_at && (
          <p className="text-sm opacity-70">Sign-ups lock {formatRaidTime(raid.locked_at)}.</p>
        )}
        {raid.notes && <p className="text-sm opacity-70">{raid.notes}</p>}
        {isOfficer && !canEdit && <p className="text-sm text-warn">{RAID_CLOSED_MESSAGE}</p>}
      </section>
      <SectionTabs
        base={`/raids/${raid.slug}`}
        tabs={[
          { segment: "", icon: "signups", label: "Sign-ups", meta: `${accepted ?? 0}/${capacity}` },
          { segment: "comp", icon: "comp", label: "Composition", meta: `${placed ?? 0}/${capacity}` },
          { segment: "loot", icon: "loot", label: "Loot", meta: `${reserved ?? 0}` },
          {
            segment: "attendance",
            icon: "attendance",
            label: "Attendance",
            meta: recorded ? "✓" : started ? "to do" : "–",
            warn: started && !recorded,
          },
          // The audit log (#90), for admins.
          ...(isAdmin ? [{ segment: "history", icon: "history" as const, label: "History", meta: "" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
