import Link from "next/link";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { formatRaidTime, hasStarted } from "@/lib/wow";
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
  const { supabase } = await requireViewer();

  const count = (table: "signups" | "comp_slots" | "attendance") =>
    supabase.from(table).select("raid_id", { count: "exact", head: true }).eq("raid_id", id);

  const [{ count: accepted }, { count: placed }, { count: recorded }] = await Promise.all([
    count("signups").eq("status", "accepted"),
    count("comp_slots"),
    count("attendance"),
  ]);

  const started = hasStarted(raid.starts_at);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <Link href="/raids" className="text-sm opacity-70 hover:opacity-100">
          ← All raids
        </Link>
        <h1 className="text-2xl font-semibold">{raid.title}</h1>
        <p className="opacity-80">
          {raid.instance} · {raid.size}-man · {formatRaidTime(raid.starts_at)} server time
        </p>
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
