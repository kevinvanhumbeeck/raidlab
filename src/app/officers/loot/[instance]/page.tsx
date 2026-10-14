import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { ItemLink } from "@/components/item-link";
import { groupByBoss, type LootItem } from "@/lib/loot";
import { requireViewer } from "@/lib/viewer";
import { addLootItems, clearLootTable, removeLootItem } from "../actions";

// Officers manage an instance's loot table, which players soft-reserve from.
export default async function LootTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ instance: string }>;
  searchParams: Promise<{ missing?: string }>;
}) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) redirect("/");

  const name = decodeURIComponent((await params).instance);
  const { missing } = await searchParams;

  const [{ data: instance }, { data: items }] = await Promise.all([
    supabase.from("instances").select("name, reserves").eq("name", name).maybeSingle(),
    supabase.from("loot_items").select("id, instance, boss, name, quality, icon").eq("instance", name).order("sort"),
  ]);
  if (!instance) notFound();

  const bosses = groupByBoss((items ?? []) as LootItem[]);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <Link href="/officers" className="text-sm opacity-70 hover:opacity-100">
          ← Officers
        </Link>
        <h1 className="text-2xl font-semibold">{instance.name} loot</h1>
        <p className="text-sm opacity-70">
          Players can soft-reserve {instance.reserves} of these items per raid. Item names and icons come from
          Wowhead&apos;s WoW Forever database.
        </p>
      </section>

      <form
        action={addLootItems.bind(null, instance.name)}
        className="space-y-3 rounded-xl border border-border bg-panel p-4"
      >
        <h2 className="font-sans font-semibold">Add items</h2>
        <label className="block space-y-1 text-sm">
          <span className="block opacity-70">Boss</span>
          <input
            name="boss"
            list="bosses"
            placeholder="e.g. Taragaman the Hungerer"
            className="w-full max-w-sm rounded border border-border bg-background px-2 py-1"
          />
          <datalist id="bosses">
            {bosses.map(([boss]) => (
              <option key={boss} value={boss} />
            ))}
          </datalist>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block opacity-70">Item IDs or Wowhead links, one per line</span>
          <textarea
            name="items"
            required
            rows={4}
            placeholder="https://www.wowhead.com/forever/item=14145/cursed-felblade"
            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
        </label>
        {missing && (
          <p className="text-sm text-amber-400">Not found on Wowhead, so not added: {missing.split(",").join(", ")}</p>
        )}
        <button className="rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          Add
        </button>
      </form>

      {bosses.length === 0 ? (
        <p className="opacity-70">No loot yet.</p>
      ) : (
        <form className="space-y-4">
          {bosses.map(([boss, bossItems]) => (
            <section key={boss} className="space-y-2">
              <h2 className="font-semibold">{boss}</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-panel">
                {bossItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                    <ItemLink item={item} />
                    <span className="text-xs tabular-nums opacity-50">{item.id}</span>
                    <ConfirmButton
                      message={`Remove ${item.name}? Reserves on it are removed too.`}
                      formAction={removeLootItem.bind(null, instance.name, item.id)}
                      className="ml-auto rounded border border-border px-2 py-0.5 text-xs hover:bg-white/5"
                    >
                      Remove
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <ConfirmButton
            message={`Remove all ${instance.name} loot, and every reserve on it?`}
            formAction={clearLootTable.bind(null, instance.name)}
            className="rounded border border-red-500/40 px-3 py-1 text-sm text-red-400 hover:bg-red-500/10"
          >
            Clear loot table
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
