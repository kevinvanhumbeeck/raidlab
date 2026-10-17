import Link from "next/link";
import { NoResponse } from "@/components/no-response";
import { botEnabled } from "@/lib/discord-bot";
import { formatRaidTime } from "@/lib/wow";
import { getNextRaid } from "./next-raid";

// Officers land here: who hasn't responded to the next raid, to ping them in Discord (#58).
export default async function ManagePage() {
  const next = await getNextRaid();

  return (
    <div className="space-y-4">
      <p className="text-sm opacity-70">
        Officers manage raids, compositions and attendance, and change a raid until 3 days after it starts. Admins can
        change raids at any time and delete raids that have started.
      </p>

      {next ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Next raid:{" "}
            <Link href={`/raids/${next.raid.slug}`} className="hover:underline">
              {next.raid.title}
            </Link>{" "}
            <span className="text-sm font-normal opacity-70">{formatRaidTime(next.raid.starts_at)}</span>
          </h2>
          <NoResponse raid={next.raid} missing={next.missing} canPing={botEnabled()} />
        </section>
      ) : (
        <p className="text-sm opacity-70">
          No raid coming up.{" "}
          <Link href="/raids" className="text-accent hover:underline">
            Plan one
          </Link>
          .
        </p>
      )}
    </div>
  );
}
