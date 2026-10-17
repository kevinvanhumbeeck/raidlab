import Link from "next/link";
import { Card, CardHeader } from "@/components/card";
import { ItemLink } from "@/components/item-link";
import { SpecIcon } from "@/components/spec-icon";
import { WowheadTooltips } from "@/components/wowhead-tooltips";
import { getGuildStats, type Stat, type StatEntry } from "@/lib/guild-stats";
import { iconUrl, qualityColor, wowheadItemUrl } from "@/lib/loot";
import { readable } from "@/lib/theme";

function EntryName({ entry, className = "" }: { entry: StatEntry; className?: string }) {
  const style = entry.color ? { color: readable(entry.color) } : undefined;
  return entry.href ? (
    <Link href={entry.href} className={`truncate font-medium hover:underline ${className}`} style={style}>
      {entry.name}
    </Link>
  ) : (
    <span className={`truncate font-medium ${className}`} style={style}>
      {entry.name}
    </span>
  );
}

function TopCard({ stat }: { stat: Stat }) {
  return (
    <Card>
      <CardHeader title={stat.title} subtitle={stat.blurb} />
      <ol className="divide-y divide-border text-sm">
        {stat.entries.map((entry, i) => (
          <li key={entry.key} className="flex items-center gap-2 px-4 py-2">
            <span className={`w-4 shrink-0 text-xs tabular-nums ${i === 0 ? "text-accent" : "text-muted"}`}>
              {i + 1}
            </span>
            {entry.item ? (
              <ItemLink item={entry.item} size="sm" />
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                {entry.specId && <SpecIcon specId={entry.specId} name={entry.name} />}
                <EntryName entry={entry} />
              </span>
            )}
            {entry.hint && <span className="truncate text-xs text-muted">{entry.hint}</span>}
            <span className="ml-auto shrink-0 tabular-nums">{entry.value}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// The winner's Discord avatar, or the item's icon; nothing for plain text like a weekday.
function SpotlightPicture({ entry }: { entry: StatEntry }) {
  const ring = "h-16 w-16 rounded-full ring-2 ring-accent/60";
  if (entry.item) {
    return (
      <a href={wowheadItemUrl(entry.item.id)} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl(entry.item.icon)}
          alt=""
          className="h-16 w-16 rounded-lg border-2"
          style={{ borderColor: readable(qualityColor(entry.item.quality)) }}
        />
        <WowheadTooltips />
      </a>
    );
  }
  if (entry.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.avatar} alt="" className={ring} />;
  }
  if (entry.href) {
    return (
      <span
        className={`${ring} flex items-center justify-center bg-panel-raised text-2xl font-semibold`}
        style={entry.color ? { color: readable(entry.color) } : undefined}
      >
        {entry.name.slice(0, 1)}
      </span>
    );
  }
  return null;
}

// Just the winner, big and centred. Others with the same score show as a count.
function SpotlightCard({ stat }: { stat: Stat }) {
  const [winner, ...rest] = stat.entries;
  const tied = rest.filter((e) => e.value === winner.value).length;
  const style = winner.item ? { color: readable(qualityColor(winner.item.quality)) } : undefined;
  return (
    <Card className="flex flex-col items-center gap-2 px-3 py-4 text-center">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">{stat.title}</h3>
      <SpotlightPicture entry={winner} />
      <div className="flex min-w-0 max-w-full flex-col items-center">
        {winner.item ? (
          <span className="max-w-full truncate font-medium" style={style}>
            {winner.name}
          </span>
        ) : (
          <EntryName entry={winner} className={winner.href ? "" : "text-lg"} />
        )}
        {winner.hint && <span className="max-w-full truncate text-xs text-muted">{winner.hint}</span>}
      </div>
      <p className="text-sm tabular-nums">
        {winner.value}
        {tied > 0 && <span className="text-muted"> · +{tied} tied</span>}
      </p>
      <p className="mt-auto text-xs text-muted">{stat.blurb}</p>
    </Card>
  );
}

// Hall of fame (#107): fun guild stats. Spotlights show one winner each, top cards the first few.
export async function GuildStats() {
  const stats = await getGuildStats();
  if (stats.length === 0) return null;
  const spotlights = stats.filter((s) => s.layout === "spotlight");
  const tops = stats.filter((s) => s.layout === "top");

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Hall of fame</h2>
      {spotlights.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {spotlights.map((stat) => (
            <SpotlightCard key={stat.id} stat={stat} />
          ))}
        </div>
      )}
      {tops.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tops.map((stat) => (
            <TopCard key={stat.id} stat={stat} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Updated hourly. Loot stats (Lucky Bastard, last item went to…) come with loot history.
      </p>
    </section>
  );
}
