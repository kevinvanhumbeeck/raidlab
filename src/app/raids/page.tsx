import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { formatRaidTime, upcomingCutoff } from "@/lib/wow";
import { NewRaidForm } from "./new-raid-form";

export default async function RaidsPage() {
  const { supabase, user, isOfficer } = await requireViewer();

  const [{ data: raids }, { data: mySignups }, { data: pastRaids }, { data: instances }] = await Promise.all([
    supabase
      .from("raids")
      .select("id, title, instance, size, starts_at, signups(status)")
      .gte("starts_at", upcomingCutoff())
      .order("starts_at"),
    supabase
      .from("signups")
      .select("raid_id, status, characters!inner(owner_id)")
      .eq("characters.owner_id", user.id),
    supabase
      .from("raids")
      .select("id, title, instance, starts_at, attendance(count)")
      .lt("starts_at", upcomingCutoff())
      .order("starts_at", { ascending: false })
      .limit(15),
    supabase.from("instances").select("name, size, tanks, healers, dps").order("sort"),
  ]);

  const myStatus = new Map(mySignups?.map((s) => [s.raid_id, s.status]));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Upcoming raids</h1>
        {raids?.length ? (
          <ul className="divide-y divide-border rounded border border-border bg-panel">
            {raids.map((raid) => {
              const accepted = raid.signups.filter((s) => s.status === "accepted").length;
              const mine = myStatus.get(raid.id);
              return (
                <li key={raid.id}>
                  <Link href={`/raids/${raid.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-white/5">
                    <span className="font-medium">{raid.title}</span>
                    <span className="text-sm opacity-70">
                      {raid.instance} · {raid.size}-man
                    </span>
                    <span className="text-sm opacity-70">{formatRaidTime(raid.starts_at)}</span>
                    <span className="ml-auto text-sm">
                      {accepted}/{raid.size} accepted
                    </span>
                    <span className={`text-xs ${mine ? "opacity-80" : "text-amber-400"}`}>
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

      {pastRaids && pastRaids.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Past raids</h2>
          <ul className="divide-y divide-border rounded border border-border bg-panel">
            {pastRaids.map((raid) => {
              const recorded = (raid.attendance[0]?.count ?? 0) > 0;
              return (
                <li key={raid.id}>
                  <Link
                    href={`/raids/${raid.id}/attendance`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-white/5"
                  >
                    <span className="font-medium">{raid.title}</span>
                    <span className="text-sm opacity-70">{formatRaidTime(raid.starts_at)}</span>
                    <span className={`ml-auto text-xs ${recorded ? "opacity-70" : "text-amber-400"}`}>
                      {recorded ? "Attendance recorded" : "Attendance not recorded"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
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
