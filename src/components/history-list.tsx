import Link from "next/link";
import type { HistoryLine } from "@/lib/history";
import { formatRaidTime } from "@/lib/wow";

// Audit log lines (#90), newest first. showRaid adds a link to the raid, for the log across all raids.
export function HistoryList({ lines, showRaid }: { lines: HistoryLine[]; showRaid?: boolean }) {
  if (!lines.length) return <p className="opacity-70">No changes recorded yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90 text-sm">
      {lines.map((line) => (
        <li key={line.id} className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 py-2">
          <span className="w-32 shrink-0 tabular-nums opacity-60">{formatRaidTime(line.at)}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{line.actor ?? "System"}</span> {line.text}
            {showRaid && line.raid && (
              <>
                {" "}
                <span className="opacity-60">in</span>{" "}
                {line.raid.slug ? (
                  <Link href={`/raids/${line.raid.slug}/history`} className="hover:underline">
                    {line.raid.title}
                  </Link>
                ) : (
                  <span className="opacity-60">{line.raid.title}</span>
                )}
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
