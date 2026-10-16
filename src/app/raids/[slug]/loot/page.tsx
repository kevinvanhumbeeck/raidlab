import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton, DownloadButton } from "@/components/copy-button";
import { ItemLink } from "@/components/item-link";
import { gargulExport, softresCsv, type ReserveExportRow } from "@/lib/gargul";
import { groupByBoss, type LootItem } from "@/lib/loot";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { STATUS_LABELS, isLocked, playerHref, type SignupStatus } from "@/lib/wow";
import { hardReserveItem, reserveItem, unhardReserveItem, unreserveItem } from "./actions";
import { LootFilter } from "./loot-filter";
import { readable } from "@/lib/theme";

type ReserveCharacter = { name: string; class_id: string; profiles: { slug: string } | null };
type ReserveRow = { character_id: string; item_id: number; created_at: string; characters: ReserveCharacter | null };

const button = "rounded border border-border px-2 py-0.5 text-xs hover:bg-foreground/5";

// Soft reserves: players pick items from the instance's loot table, officers export them to Gargul. Officers can
// hard-reserve items, which keeps them out of rolls.
export default async function LootPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { id } = raid;
  const { supabase, user, isOfficer } = await requireViewer();

  const [
    { data: instance },
    { data: items },
    { data: reserveRows },
    { data: hardReserveRows },
    { data: mySignups },
    { data: classes },
  ] = await Promise.all([
      supabase.from("instances").select("reserves").eq("name", raid.instance).maybeSingle(),
      supabase
        .from("loot_items")
        .select("id, instance, boss, name, quality, icon")
        .eq("instance", raid.instance)
        .order("sort"),
      supabase
        .from("reserves")
        // Through the sign-up: reserves have no foreign key to characters of their own (see the
        // 20261022000000 migration).
        .select("character_id, item_id, created_at, signups(characters(name, class_id, profiles(slug)))")
        .eq("raid_id", id)
        .order("created_at")
        .overrideTypes<
          (Omit<ReserveRow, "characters"> & { signups: { characters: ReserveCharacter | null } | null })[],
          { merge: false }
        >(),
      supabase.from("hard_reserves").select("item_id").eq("raid_id", id),
      supabase
        .from("signups")
        .select("character_id, status, characters!inner(name, owner_id)")
        .eq("raid_id", id)
        .eq("characters.owner_id", user.id)
        .overrideTypes<
          { character_id: string; status: SignupStatus; characters: { name: string } }[],
          { merge: false }
        >(),
      supabase.from("classes").select("id, name, color"),
    ]);

  const reserves: ReserveRow[] = (reserveRows ?? []).map(({ signups, ...r }) => ({
    ...r,
    characters: signups?.characters ?? null,
  }));
  const limit = instance?.reserves ?? 0;
  const locked = isLocked(raid);
  const classById = new Map(classes?.map((c) => [c.id, c]));
  const lootItems = (items ?? []) as LootItem[];
  const itemById = new Map(lootItems.map((item) => [item.id, item]));

  const hardReserved = new Set(hardReserveRows?.map((r) => r.item_id));
  const hardReservedItems = lootItems.filter((item) => hardReserved.has(item.id));

  const reservesByItem = new Map<number, ReserveRow[]>();
  for (const r of reserves) reservesByItem.set(r.item_id, [...(reservesByItem.get(r.item_id) ?? []), r]);

  // Each player signs up with one character per raid.
  const mine = mySignups?.[0];
  const canReserve = !!mine && mine.status !== "declined" && (!locked || isOfficer);
  const myReserves = new Set(reserves.filter((r) => r.character_id === mine?.character_id).map((r) => r.item_id));
  const full = !isOfficer && myReserves.size >= limit;

  let exportRows: ReserveExportRow[] = [];
  if (isOfficer) {
    exportRows = reserves.flatMap((r) => {
      const item = itemById.get(r.item_id);
      if (!item || !r.characters) return [];
      return [
        {
          character: r.characters.name,
          className: classById.get(r.characters.class_id)?.name ?? "",
          itemId: item.id,
          itemName: item.name,
          boss: item.boss,
          createdAt: r.created_at,
        },
      ];
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-xl border border-border bg-panel/90 p-4 text-sm">
        {!mine ? (
          <p>
            <Link href={`/raids/${raid.slug}`} className="text-accent hover:underline">
              Sign up
            </Link>{" "}
            to soft-reserve up to {limit} items.
          </p>
        ) : mine.status === "declined" ? (
          <p className="opacity-70">You declined this raid, so you can&apos;t reserve items.</p>
        ) : (
          <p>
            <span className="font-medium">{mine.characters.name}</span>{" "}
            <span className="opacity-60">({STATUS_LABELS[mine.status]})</span> reserved{" "}
            <span className="font-medium tabular-nums">
              {myReserves.size}/{limit}
            </span>{" "}
            items.
            {locked && !isOfficer && <span className="opacity-70"> Reserves are locked.</span>}
          </p>
        )}
        <p className="opacity-60">
          Soft reserves are visible to everyone. If several players reserve the same item, they roll for it.
        </p>
      </section>

      {hardReservedItems.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-panel/90 p-4 text-sm">
          <h2 className="font-sans font-semibold">Hard reserved</h2>
          <p className="opacity-60">The officers keep these items out of rolls, so they can&apos;t be soft-reserved.</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {hardReservedItems.map((item) => (
              <li key={item.id}>
                <ItemLink item={item} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {isOfficer && (
        <section className="space-y-2 rounded-xl border border-border bg-panel/90 p-4 text-sm">
          <h2 className="font-sans font-semibold">Export for the loot master</h2>
          <p className="opacity-70">
            {exportRows.length} reserves, {hardReservedItems.length} hard reserves. In game, type{" "}
            <code>/gl sr</code> (Gargul), paste the copied string and import. The CSV is a softres.it-style
            fallback for other loot addons.
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyButton
              text={gargulExport(
                raid,
                exportRows,
                hardReservedItems.map((item) => item.id),
                `https://www.raidlab.net/raids/${raid.slug}/loot`,
              )}
              className="rounded bg-accent px-3 py-1 font-medium text-accent-foreground hover:bg-accent-hover"
            >
              Copy for Gargul
            </CopyButton>
            <DownloadButton
              text={softresCsv(exportRows)}
              filename={`${raid.slug}-reserves.csv`}
              className="rounded border border-border px-3 py-1 hover:bg-foreground/5"
            >
              Download CSV
            </DownloadButton>
            <Link
              href={`/officers/loot/${encodeURIComponent(raid.instance)}`}
              className="ml-auto rounded border border-border px-3 py-1 hover:bg-foreground/5"
            >
              Edit loot table
            </Link>
          </div>
        </section>
      )}

      {lootItems.length === 0 ? (
        <p className="opacity-70">
          {raid.instance} has no loot table yet.
          {isOfficer && (
            <>
              {" "}
              <Link
                href={`/officers/loot/${encodeURIComponent(raid.instance)}`}
                className="text-accent hover:underline"
              >
                Add items
              </Link>
            </>
          )}
        </p>
      ) : (
        <LootFilter>
          {groupByBoss(lootItems).map(([boss, bossItems]) => (
            <section key={boss} data-boss={boss.toLowerCase()} className="space-y-2">
              <h2 className="font-semibold">{boss}</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
                {bossItems.map((item) => {
                  const itemReserves = reservesByItem.get(item.id) ?? [];
                  const reserved = myReserves.has(item.id);
                  const hard = hardReserved.has(item.id);
                  const showReserve = canReserve && !!mine && !hard;
                  const n = itemReserves.length;
                  const hardMessage = n
                    ? `Hard-reserve ${item.name}? Its ${n} soft reserve${n === 1 ? " is" : "s are"} removed.`
                    : `Hard-reserve ${item.name}? Nobody can soft-reserve it.`;
                  return (
                    <li
                      key={item.id}
                      data-item-name={item.name.toLowerCase()}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2"
                    >
                      <div className="w-64 max-w-full">
                        <ItemLink item={item} />
                      </div>
                      <div className="flex flex-1 flex-wrap gap-x-2 text-sm">
                        {hard && (
                          <span className="rounded border border-amber-500/40 px-1.5 text-xs text-warn">
                            Hard reserved
                          </span>
                        )}
                        {itemReserves.map((r) => (
                          <span key={r.character_id} className="inline-flex items-center gap-1">
                            <Link
                              href={playerHref(r.characters?.profiles?.slug ?? "", r.characters?.name)}
                              className="hover:underline"
                              style={{ color: readable(classById.get(r.characters?.class_id ?? "")?.color) }}
                            >
                              {r.characters?.name}
                            </Link>
                            {isOfficer && r.character_id !== mine?.character_id && (
                              <form action={unreserveItem.bind(null, id, r.character_id, item.id)}>
                                <button title="Remove reserve" className="text-xs opacity-50 hover:opacity-100">
                                  ×
                                </button>
                              </form>
                            )}
                          </span>
                        ))}
                      </div>
                      {showReserve && mine && (
                        <form
                          action={(reserved ? unreserveItem : reserveItem).bind(null, id, mine.character_id, item.id)}
                          className="ml-auto"
                        >
                          <button
                            disabled={!reserved && full}
                            className={`${button} ${reserved ? "border-accent text-accent" : ""} disabled:opacity-40`}
                          >
                            {reserved ? "Reserved ✓" : "Reserve"}
                          </button>
                        </form>
                      )}
                      {isOfficer && (
                        <form className={showReserve ? "" : "ml-auto"}>
                          {hard ? (
                            <button
                              formAction={unhardReserveItem.bind(null, id, item.id)}
                              title="Allow soft reserves again"
                              className={`${button} border-amber-500/40 text-warn`}
                            >
                              HR ✓
                            </button>
                          ) : (
                            <ConfirmButton
                              message={hardMessage}
                              formAction={hardReserveItem.bind(null, id, item.id)}
                              className={button}
                            >
                              HR
                            </ConfirmButton>
                          )}
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </LootFilter>
      )}
    </div>
  );
}
