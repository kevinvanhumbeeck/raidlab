import { redirect } from "next/navigation";
import { officersFromDiscord } from "@/lib/discord";
import { requireViewer } from "@/lib/viewer";
import { setMember, setOfficer } from "./actions";
import { InstanceSettings } from "./instance-settings";

export default async function OfficersPage() {
  const { supabase, user, isOfficer } = await requireViewer();
  if (!isOfficer) redirect("/");

  const [{ data: profiles }, { data: characters }, { data: classes }, { data: instances }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url, is_officer, is_member, created_at"),
    supabase.from("characters").select("owner_id, name, class_id, is_main").order("is_main", { ascending: false }),
    supabase.from("classes").select("id, color"),
    supabase.from("instances").select("name, size, tanks, healers, dps").order("sort"),
  ]);

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const charactersOf = new Map<string, { name: string; class_id: string }[]>();
  for (const c of characters ?? []) charactersOf.set(c.owner_id, [...(charactersOf.get(c.owner_id) ?? []), c]);

  const sorted = [...(profiles ?? [])].sort(
    (a, b) =>
      Number(b.is_officer) - Number(a.is_officer) ||
      Number(b.is_member) - Number(a.is_member) ||
      a.display_name.localeCompare(b.display_name),
  );
  const officerCount = sorted.filter((p) => p.is_officer).length;
  const discordOfficers = officersFromDiscord();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Officers & members</h1>
      <p className="text-sm opacity-70">
        Officers manage raids, compositions and attendance. Access is checked against the Discord server at every login:
        the @raider, @pug and @officer roles let players in
        {discordOfficers ? ", and the @officer role makes them an officer here" : ""}. Revoking access here locks
        someone out until their next login.
      </p>

      <ul className="divide-y divide-border rounded border border-border bg-panel">
        {sorted.map((p) => {
          const chars = charactersOf.get(p.id) ?? [];
          const lastOfficer = p.is_officer && officerCount === 1;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-border" />
              )}
              <div className="min-w-40">
                <div className="font-medium">
                  {p.display_name}
                  {p.id === user.id && <span className="ml-2 text-xs opacity-60">you</span>}
                </div>
                <div className="text-xs">
                  {chars.length ? (
                    chars.map((c, i) => (
                      <span key={c.name}>
                        {i > 0 && ", "}
                        <span style={{ color: color.get(c.class_id) }}>{c.name}</span>
                      </span>
                    ))
                  ) : (
                    <span className="opacity-60">No characters</span>
                  )}
                </div>
              </div>

              <div className="ml-auto flex flex-wrap gap-2 text-sm">
                {p.is_officer ? (
                  <span className="rounded bg-accent/20 px-2 py-1 text-xs">Officer</span>
                ) : (
                  <span className={`rounded px-2 py-1 text-xs ${p.is_member ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                    {p.is_member ? "Member" : "No access"}
                  </span>
                )}
                {!p.is_officer && (
                  <form action={setMember.bind(null, p.id, !p.is_member)}>
                    <button className="rounded border border-border px-2 py-1 text-xs hover:bg-white/5">
                      {p.is_member ? "Revoke access" : "Grant access"}
                    </button>
                  </form>
                )}
                {!discordOfficers && (
                  <form action={setOfficer.bind(null, p.id, !p.is_officer)}>
                    <button
                      disabled={lastOfficer}
                      title={lastOfficer ? "There must be at least one officer" : undefined}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
                    >
                      {p.is_officer ? "Remove officer" : "Make officer"}
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <InstanceSettings instances={instances ?? []} />
    </div>
  );
}
