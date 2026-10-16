import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { redirect } from "next/navigation";
import { NoResponse } from "@/components/no-response";
import { officersFromDiscord } from "@/lib/discord";
import { botEnabled } from "@/lib/discord-bot";
import { noResponse } from "@/lib/no-response";
import { requireViewer } from "@/lib/viewer";
import { formatRaidTime, playerHref } from "@/lib/wow";
import { setAdmin, setMember, setOfficer } from "./actions";
import { InstanceSettings } from "./instance-settings";
import { readable } from "@/lib/theme";

export default async function OfficersPage() {
  const { supabase, user, isOfficer, isAdmin } = await requireViewer();
  if (!isOfficer) redirect("/");

  const [{ data: profiles }, { data: characters }, { data: classes }, { data: instances }, { data: nextRaid }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, slug, display_name, avatar_url, is_officer, is_member, is_admin, created_at"),
      supabase
        .from("characters")
        .select("id, owner_id, name, class_id, is_main")
        .is("archived_at", null)
        .order("is_main", { ascending: false }),
      supabase.from("classes").select("id, color"),
      supabase.from("instances").select("name, size, tanks, healers, dps, reserves").order("sort"),
      supabase
        .from("raids")
        .select("id, slug, title, starts_at, locked_at, pinged_at")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(1)
        .maybeSingle(),
    ]);
  const missing = nextRaid ? await noResponse(supabase, nextRaid.id) : null;

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const charactersOf = new Map<string, { id: string; name: string; class_id: string }[]>();
  for (const c of characters ?? []) charactersOf.set(c.owner_id, [...(charactersOf.get(c.owner_id) ?? []), c]);

  const sorted = [...(profiles ?? [])].sort(
    (a, b) =>
      Number(b.is_admin) - Number(a.is_admin) ||
      Number(b.is_officer) - Number(a.is_officer) ||
      Number(b.is_member) - Number(a.is_member) ||
      a.display_name.localeCompare(b.display_name),
  );
  const officerCount = sorted.filter((p) => p.is_officer).length;
  const adminCount = sorted.filter((p) => p.is_admin).length;
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
      <p className="text-sm opacity-70">
        Officers change a raid until 3 days after it starts. Admins can change raids at any time, delete raids that have
        started, and manage officers, admins, instances and loot tables. Admins are only managed here, never from
        Discord.
        {isAdmin && (
          <>
            {" "}
            <Link href="/manage/history" className="text-accent hover:underline">
              See the history of changes
            </Link>
            .
          </>
        )}
      </p>

      {nextRaid && missing && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Next raid:{" "}
            <Link href={`/raids/${nextRaid.slug}`} className="hover:underline">
              {nextRaid.title}
            </Link>{" "}
            <span className="text-sm font-normal opacity-70">{formatRaidTime(nextRaid.starts_at)}</span>
          </h2>
          <NoResponse raid={nextRaid} missing={missing} canPing={botEnabled()} />
        </section>
      )}

      <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
        {sorted.map((p) => {
          const chars = charactersOf.get(p.id) ?? [];
          const lastOfficer = p.is_officer && officerCount === 1;
          const lastAdmin = p.is_admin && adminCount === 1;
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
                  <Link href={playerHref(p.slug)} className="hover:underline">
                    {p.display_name}
                  </Link>
                  {p.id === user.id && <span className="ml-2 text-xs opacity-60">you</span>}
                </div>
                <div className="text-xs">
                  {chars.length ? (
                    chars.map((c, i) => (
                      <span key={c.name}>
                        {i > 0 && ", "}
                        <Link
                          href={playerHref(p.slug, c.name)}
                          className="hover:underline"
                          style={{ color: readable(color.get(c.class_id)) }}
                        >
                          {c.name}
                        </Link>
                      </span>
                    ))
                  ) : (
                    <span className="opacity-60">No characters</span>
                  )}
                </div>
              </div>

              <div className="ml-auto flex flex-wrap gap-2 text-sm">
                {p.is_admin && <span className="rounded bg-amber-500/20 px-2 py-1 text-xs">Admin</span>}
                {p.is_officer ? (
                  <span className="rounded bg-accent/20 px-2 py-1 text-xs">Officer</span>
                ) : (
                  !p.is_admin && (
                    <span
                      className={`rounded px-2 py-1 text-xs ${p.is_member ? "bg-emerald-500/20" : "bg-red-500/20"}`}
                    >
                      {p.is_member ? "Member" : "No access"}
                    </span>
                  )
                )}
                {!p.is_officer && !p.is_admin && (
                  <form action={setMember.bind(null, p.id, !p.is_member)}>
                    <button className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/5">
                      {p.is_member ? "Revoke access" : "Grant access"}
                    </button>
                  </form>
                )}
                {isAdmin && !discordOfficers && (
                  <form action={setOfficer.bind(null, p.id, !p.is_officer)}>
                    <button
                      disabled={lastOfficer}
                      title={lastOfficer ? "There must be at least one officer" : undefined}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/5 disabled:opacity-40"
                    >
                      {p.is_officer ? "Remove officer" : "Make officer"}
                    </button>
                  </form>
                )}
                {isAdmin && (
                  <form action={setAdmin.bind(null, p.id, !p.is_admin)}>
                    <ConfirmButton
                      message={
                        p.is_admin
                          ? `Remove ${p.display_name} as admin?`
                          : `Make ${p.display_name} an admin? Admins can change past raids and manage officers.`
                      }
                      disabled={lastAdmin}
                      title={lastAdmin ? "There must be at least one admin" : undefined}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/5 disabled:opacity-40"
                    >
                      {p.is_admin ? "Remove admin" : "Make admin"}
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <InstanceSettings instances={instances ?? []} editable={isAdmin} />
    </div>
  );
}
