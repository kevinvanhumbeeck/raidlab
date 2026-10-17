import Link from "next/link";
import { Card, CardHeader } from "@/components/card";
import { ItemLink } from "@/components/item-link";
import { SpecIcon } from "@/components/spec-icon";
import { getGuildStats, type StatEntry } from "@/lib/guild-stats";
import { readable } from "@/lib/theme";

function EntryName({ entry }: { entry: StatEntry }) {
  if (entry.item) return <ItemLink item={entry.item} size="sm" />;
  const style = entry.color ? { color: readable(entry.color) } : undefined;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {entry.specId && <SpecIcon specId={entry.specId} name={entry.name} />}
      {entry.href ? (
        <Link href={entry.href} className="truncate font-medium hover:underline" style={style}>
          {entry.name}
        </Link>
      ) : (
        <span className="truncate font-medium" style={style}>
          {entry.name}
        </span>
      )}
    </span>
  );
}

// Hall of fame (#107): fun guild stats, a card each, the top few per card.
export async function GuildStats() {
  const stats = await getGuildStats();
  if (stats.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Hall of fame</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.id}>
            <CardHeader title={stat.title} subtitle={stat.blurb} />
            <ol className="divide-y divide-border text-sm">
              {stat.entries.map((entry, i) => (
                <li key={entry.key} className="flex items-center gap-2 px-4 py-2">
                  <span className={`w-4 shrink-0 text-xs tabular-nums ${i === 0 ? "text-accent" : "text-muted"}`}>
                    {i + 1}
                  </span>
                  <EntryName entry={entry} />
                  {entry.hint && <span className="truncate text-xs text-muted">{entry.hint}</span>}
                  <span className="ml-auto shrink-0 tabular-nums">{entry.value}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">
        Updated hourly. Loot stats (Lucky Bastard, last item went to…) come with loot history.
      </p>
    </section>
  );
}
