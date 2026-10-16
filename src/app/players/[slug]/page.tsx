import Link from "next/link";
import { CharacterSpecs, SpecIcon } from "@/components/spec-icon";
import { attendanceSummary, betterStatus, type RecordedRaid } from "@/lib/attendance";
import { iconUrl, qualityColor } from "@/lib/loot";
import { getPlayer } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import {
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  COUNTS_AS_ATTENDED,
  DUTY_LABELS,
  RAID_DUTIES,
  ROLES,
  ROLE_NAMES,
  STATUS_DOT,
  STATUS_LABELS,
  effectiveRole,
  formatRaidTime,
  hasStarted,
  type AttendanceStatus,
  type RaidDuty,
  type Role,
  type SignupStatus,
} from "@/lib/wow";
import { readable } from "@/lib/theme";

const RECENT = 20;

type RaidInfo = { id: string; slug: string; title: string; instance: string; starts_at: string };

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ character?: string }>;
}) {
  const { slug } = await params;
  const profile = await getPlayer(slug);
  const { id } = profile;
  const { character: highlighted } = await searchParams;
  const { supabase, user } = await requireViewer();

  const [{ data: characters }, { data: classes }, { data: specs }, { data: recorded }] =
    await Promise.all([
      supabase
        .from("characters")
        .select("id, name, class_id, main_spec_id, off_spec_ids, is_main")
        .eq("owner_id", id)
        .order("is_main", { ascending: false })
        .order("name"),
      supabase.from("classes").select("id, name, color"),
      supabase.from("specs").select("id, name, roles"),
      // Every raid with recorded attendance, for the attendance percentage.
      supabase
        .from("attendance")
        .select("raid_id, raids(title, starts_at)")
        .overrideTypes<{ raid_id: string; raids: { title: string; starts_at: string } | null }[], { merge: false }>(),
    ]);

  const characterIds = (characters ?? []).map((c) => c.id);
  const [{ data: signups }, { data: slots }, { data: attendance }, { data: duties }, { data: reserves }] =
    await Promise.all([
      supabase.from("signups").select("raid_id, character_id, status, spec_id").in("character_id", characterIds),
      supabase
        .from("comp_slots")
        .select("raid_id, character_id, group_no, spec_id, role")
        .in("character_id", characterIds),
      supabase.from("attendance").select("raid_id, character_id, status").in("character_id", characterIds),
      supabase.from("raid_duties").select("raid_id, duty").in("character_id", characterIds),
      supabase
        .from("reserves")
        .select("raid_id, loot_items(id, name, quality, icon)")
        .in("character_id", characterIds)
        .order("created_at")
        .overrideTypes<
          { raid_id: string; loot_items: { id: number; name: string; quality: number; icon: string | null } | null }[],
          { merge: false }
        >(),
    ]);

  const raidIds = [
    ...new Set([...(signups ?? []), ...(slots ?? []), ...(attendance ?? []), ...(duties ?? [])].map((r) => r.raid_id)),
  ];
  const { data: raids } = await supabase
    .from("raids")
    .select("id, slug, title, instance, starts_at")
    .in("id", raidIds)
    .order("starts_at", { ascending: false })
    .overrideTypes<RaidInfo[], { merge: false }>();

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));
  const characterById = new Map(characters?.map((c) => [c.id, c]));
  const main = characters?.[0];
  const specName = (specId: string) => specById.get(specId)?.name ?? "";

  // Attendance, counted the same way as the Attendance page.
  const recordedRaids = new Map<string, RecordedRaid>();
  for (const r of recorded ?? []) {
    if (r.raids) recordedRaids.set(r.raid_id, { id: r.raid_id, title: r.raids.title, startsAt: r.raids.starts_at });
  }
  const perRaid = new Map<string, AttendanceStatus>();
  for (const a of attendance ?? []) perRaid.set(a.raid_id, betterStatus(perRaid.get(a.raid_id), a.status));
  const summary = attendanceSummary(
    [...recordedRaids.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    perRaid,
    profile.created_at,
  );

  // One line per raid the player signed up for, was placed in or has attendance for.
  const history = (raids ?? []).map((raid) => {
    const slot = slots?.find((s) => s.raid_id === raid.id);
    const signup = signups?.find((s) => s.raid_id === raid.id);
    const characterId =
      slot?.character_id ?? attendance?.find((a) => a.raid_id === raid.id)?.character_id ?? signup?.character_id;
    const character = characterId ? characterById.get(characterId) : undefined;
    const specId = slot?.spec_id ?? signup?.spec_id ?? character?.main_spec_id ?? null;
    return {
      raid,
      character,
      specId,
      group: slot?.group_no ?? null,
      role: slot ? effectiveRole(specById.get(specId ?? ""), slot.role as Role | null) : null,
      duties: (duties ?? []).filter((d) => d.raid_id === raid.id).map((d) => d.duty as RaidDuty),
      reserves: (reserves ?? []).flatMap((r) => (r.raid_id === raid.id && r.loot_items ? [r.loot_items] : [])),
      signup: (signup?.status ?? null) as SignupStatus | null,
      // Recorded raids without a record for this player count as absent.
      status: perRaid.get(raid.id) ?? (recordedRaids.has(raid.id) ? "absent" : null),
    };
  });
  const upcoming = history.filter((h) => !hasStarted(h.raid.starts_at) && h.signup).reverse();
  const past = history.filter((h) => hasStarted(h.raid.starts_at));
  const attended = past.filter((h) => h.status && COUNTS_AS_ATTENDED.includes(h.status));

  const countBy = <T extends string>(items: T[]) => {
    const counts = new Map<T, number>();
    for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
    return counts;
  };
  const perInstance = countBy(attended.map((h) => h.raid.instance));
  const perRole = countBy(attended.flatMap((h) => (h.role ? [h.role] : [])));
  const perDuty = countBy(past.flatMap((h) => h.duties));

  const stats = [
    { label: "Raids attended", items: [...perInstance].map(([name, n]) => `${name} ${n}`) },
    {
      label: "Roles played",
      items: ROLES.filter((r) => perRole.has(r)).map((r) => `${ROLE_NAMES[r]} ${perRole.get(r)}`),
    },
    {
      label: "Duties",
      items: RAID_DUTIES.filter((d) => perDuty.has(d)).map((d) => `${DUTY_LABELS[d]} ${perDuty.get(d)}`),
    },
  ].filter((s) => s.items.length);

  const memberSince = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(profile.created_at),
  );

  return (
    <div className="space-y-8">
      <section className="flex items-center gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full" />
        ) : (
          <span className="h-14 w-14 rounded-full bg-border" />
        )}
        <div className="space-y-0.5">
          <h1
            className="text-2xl font-semibold"
            style={{ color: readable(main ? classById.get(main.class_id)?.color : undefined) }}
          >
            {main?.name ?? profile.display_name}
          </h1>
          <p className="text-sm opacity-70">
            {profile.display_name} on Discord
            {profile.is_officer && " · Officer"} · Member since {memberSince}
            {profile.id === user.id && " · you"}
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-panel/90 p-4">
          <h2 className="font-sans font-semibold">Characters</h2>
          {characters?.length ? (
            <ul className="space-y-1.5 text-sm">
              {characters.map((c) => {
                const cls = classById.get(c.class_id);
                return (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 ${
                      c.name.toLowerCase() === highlighted?.toLowerCase() ? "bg-accent/15 ring-1 ring-accent/60" : ""
                    }`}
                  >
                    <CharacterSpecs mainSpecId={c.main_spec_id} offSpecIds={c.off_spec_ids} specName={specName} />
                    <span className="font-medium" style={{ color: readable(cls?.color) }}>
                      {c.name}
                    </span>
                    <span className="text-xs opacity-60">
                      {specName(c.main_spec_id)} {cls?.name}
                    </span>
                    <span className="ml-auto text-xs opacity-60">{c.is_main ? "main" : "alt"}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm opacity-70">No characters yet.</p>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-panel/90 p-4">
          <h2 className="font-sans font-semibold">Attendance</h2>
          {summary.total ? (
            <>
              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{summary.pct}%</span>
                <span className="text-sm opacity-70">
                  of {summary.total} raid{summary.total === 1 ? "" : "s"} since joining
                </span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {ATTENDANCE_STATUSES.map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-sm ${ATTENDANCE_COLORS[s]}`} />
                    {ATTENDANCE_LABELS[s]} <strong className="tabular-nums">{summary.counts[s]}</strong>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {summary.history.slice(0, RECENT).map(({ raid, status }) => (
                  <span
                    key={raid.id}
                    title={`${raid.title} · ${formatRaidTime(raid.startsAt)} · ${ATTENDANCE_LABELS[status]}`}
                    className={`h-3 w-3 rounded-sm ${ATTENDANCE_COLORS[status]}`}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm opacity-70">No recorded raids since joining yet.</p>
          )}
          {stats.length > 0 && (
            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-wrap gap-x-2">
                  <dt className="opacity-60">{s.label}</dt>
                  <dd>{s.items.join(" · ")}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
            {upcoming.map((h) => (
              <li key={h.raid.id}>
                <Link
                  href={`/raids/${h.raid.slug}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-foreground/5"
                >
                  <span className="font-medium">{h.raid.title}</span>
                  <span className="opacity-70">{formatRaidTime(h.raid.starts_at)}</span>
                  {h.character && (
                    <span style={{ color: readable(classById.get(h.character.class_id)?.color) }}>{h.character.name}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5 text-xs">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[h.signup!]}`} />
                    {STATUS_LABELS[h.signup!]}
                    {h.group && <span className="opacity-70">· group {h.group}</span>}
                  </span>
                  {h.reserves.length > 0 && (
                    <span className="flex w-full flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="opacity-60">Reserved</span>
                      {h.reserves.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1"
                          style={{ color: readable(qualityColor(item.quality)) }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={iconUrl(item.icon)} alt="" className="h-4 w-4 rounded" />
                          {item.name}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Raid history</h2>
        {past.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-panel/90">
            <table className="w-full text-sm">
              <thead className="text-left text-xs opacity-70">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Raid</th>
                  <th className="px-3 py-2 font-medium">Character</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Duty</th>
                  <th className="px-3 py-2 font-medium">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {past.map((h) => (
                  <tr key={h.raid.id}>
                    <td className="px-3 py-2">
                      <Link href={`/raids/${h.raid.slug}/attendance`} className="font-medium hover:underline">
                        {h.raid.title}
                      </Link>
                      <div className="text-xs opacity-60">{formatRaidTime(h.raid.starts_at)}</div>
                    </td>
                    <td className="px-3 py-2">
                      {h.character && (
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {h.specId && <SpecIcon specId={h.specId} name={specName(h.specId)} size={16} />}
                          <span style={{ color: readable(classById.get(h.character.class_id)?.color) }}>{h.character.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{h.role ? ROLE_NAMES[h.role] : <span className="opacity-40">—</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{h.group ?? <span className="opacity-40">—</span>}</td>
                    <td className="px-3 py-2 text-xs">{h.duties.map((d) => DUTY_LABELS[d]).join(", ")}</td>
                    <td className="px-3 py-2">
                      {h.status ? (
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className={`h-2.5 w-2.5 rounded-sm ${ATTENDANCE_COLORS[h.status]}`} />
                          {ATTENDANCE_LABELS[h.status]}
                        </span>
                      ) : (
                        <span className="text-xs opacity-50">Not recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="opacity-70">No raids yet.</p>
        )}
      </section>
    </div>
  );
}
