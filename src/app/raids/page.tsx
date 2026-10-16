import Link from "next/link";
import { Pager, pageParam } from "@/components/pager";
import { requireViewer } from "@/lib/viewer";
import { formatRaidTime, isLocked, upcomingCutoff } from "@/lib/wow";
import { NewRaidForm } from "./new-raid-form";

const PAST_PAGE_SIZE = 15;

export default async function RaidsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, user, isOfficer } = await requireViewer();
  // Pages of past raids, newest first; upcoming raids always show in full.
  const page = pageParam((await searchParams).page);
  const from = (page - 1) * PAST_PAGE_SIZE;

  const [{ data: raids }, { data: mySignups }, { data: pastRaids }, { data: instances }] = await Promise.all([
    supabase
      .from("raids")
      .select("id, slug, title, instance, size, splits, starts_at, locked_at, signups(status)")
      .gte("starts_at", upcomingCutoff())
      .order("starts_at"),
    supabase.from("signups").select("raid_id, status, characters!inner(owner_id)").eq("characters.owner_id", user.id),
    supabase
      .from("raids")
      .select("id, slug, title, instance, starts_at, attendance(count)")
      .lt("starts_at", upcomingCutoff())
      .order("starts_at", { ascending: false })
      .order("id")
      // One extra row tells whether there's an older page.
      .range(from, from + PAST_PAGE_SIZE),
    supabase.from("instances").select("name, size, tanks, healers, dps").order("sort"),
  ]);

  const myStatus = new Map(mySignups?.map((s) => [s.raid_id, s.status]));
  const hasOlder = (pastRaids?.length ?? 0) > PAST_PAGE_SIZE;
  const pageHref = (n: number) => (n > 1 ? `?page=${n}#past` : "/raids#past");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Upcoming raids</h1>
        {raids?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
            {raids.map((raid) => {
              const accepted = raid.signups.filter((s) => s.status === "accepted").length;
              const mine = myStatus.get(raid.id);
              return (
                <li key={raid.id}>
                  <Link
                    href={`/raids/${raid.slug}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-foreground/5"
                  >
                    <span className="font-medium">{raid.title}</span>
                    <span className="text-sm opacity-70">
                      {raid.instance} · {raid.size}-man{raid.splits > 1 && ` × ${raid.splits}`}
                    </span>
                    <span className="text-sm opacity-70">{formatRaidTime(raid.starts_at)}</span>
                    {isLocked(raid) && <span className="text-xs text-danger">🔒 Locked</span>}
                    <span className="ml-auto text-sm">
                      {accepted}/{raid.size * raid.splits} accepted
                    </span>
                    <span className={`text-xs ${mine ? "opacity-80" : "text-warn"}`}>
                      {mine ? `You: ${mine}` : "Not signed up"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="opacity-70">No raids planned yet.</p>
        )}
      </section>

      {pastRaids && (pastRaids.length > 0 || page > 1) && (
        <section id="past" className="scroll-mt-4 space-y-3">
          <h2 className="text-lg font-semibold">Past raids</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
            {pastRaids.slice(0, PAST_PAGE_SIZE).map((raid) => {
              const recorded = (raid.attendance[0]?.count ?? 0) > 0;
              return (
                <li key={raid.id}>
                  <Link
                    href={`/raids/${raid.slug}/attendance`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-foreground/5"
                  >
                    <span className="font-medium">{raid.title}</span>
                    <span className="text-sm opacity-70">{formatRaidTime(raid.starts_at)}</span>
                    <span className={`ml-auto text-xs ${recorded ? "opacity-70" : "text-warn"}`}>
                      {recorded ? "Attendance recorded" : "Attendance not recorded"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pager newer={page > 1 ? pageHref(page - 1) : null} older={hasOlder ? pageHref(page + 1) : null} />
        </section>
      )}

      {isOfficer && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">New raid</h2>
          <NewRaidForm instances={instances ?? []} />
        </section>
      )}
    </div>
  );
}
