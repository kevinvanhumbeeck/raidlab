import Link from "next/link";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { formatRaidTime, hasStarted, isLocked } from "@/lib/wow";
import { setRaidLock } from "../actions";
import { RaidTabs } from "./raid-tabs";

// Shared header and tabs for a raid's sign-ups, composition and attendance pages.
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
  const { supabase, isOfficer } = await requireViewer();

  const count = (table: "signups" | "comp_slots" | "attendance") =>
    supabase.from(table).select("raid_id", { count: "exact", head: true }).eq("raid_id", id);

  const [{ count: accepted }, { count: placed }, { count: recorded }] = await Promise.all([
    count("signups").eq("status", "accepted"),
    count("comp_slots"),
    count("attendance"),
  ]);

  const started = hasStarted(raid.starts_at);
  const locked = isLocked(raid);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <Link href="/raids" className="text-sm opacity-70 hover:opacity-100">
          ← All raids
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{raid.title}</h1>
          {locked && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">🔒 Locked</span>
          )}
          {isOfficer && (
            <form action={setRaidLock.bind(null, id, !locked)} className="ml-auto">
              <button className="rounded border border-border px-3 py-1 text-sm hover:bg-white/5">
                {locked ? "Unlock sign-ups" : "Lock sign-ups"}
              </button>
            </form>
          )}
        </div>
        <p className="opacity-80">
          {raid.instance} · {raid.size}-man · {formatRaidTime(raid.starts_at)} server time
        </p>
        {!locked && raid.locked_at && (
          <p className="text-sm opacity-70">Sign-ups lock {formatRaidTime(raid.locked_at)}.</p>
        )}
        {raid.notes && <p className="text-sm opacity-70">{raid.notes}</p>}
      </section>
      <RaidTabs
        raidSlug={raid.slug}
        tabs={[
          { segment: "", label: "Sign-ups", meta: `${accepted ?? 0}/${raid.size}` },
          { segment: "comp", label: "Composition", meta: `${placed ?? 0}/${raid.size}` },
          {
            segment: "attendance",
            label: "Attendance",
            meta: recorded ? "✓" : started ? "to do" : "–",
            warn: started && !recorded,
          },
        ]}
      />
      {children}
    </div>
  );
}
