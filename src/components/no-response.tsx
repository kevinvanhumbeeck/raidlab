import Link from "next/link";
import { pingNoResponse } from "@/app/raids/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { PING_COOLDOWN_MINUTES, type Missing } from "@/lib/no-response";
import { readable } from "@/lib/theme";
import { ROLES, ROLE_LABELS, hasStarted, isLocked, playerHref, rolesText } from "@/lib/wow";

// Officers: who hasn't responded to a raid, per role, with a button to ping them in Discord (#58).
export function NoResponse({
  raid,
  missing,
  canPing,
}: {
  raid: { id: string; starts_at: string; locked_at: string | null; pinged_at: string | null };
  missing: Missing[];
  canPing: boolean;
}) {
  if (!missing.length) {
    return (
      <p className="rounded-xl border border-border bg-panel/90 p-4 text-sm opacity-70">Every member has responded.</p>
    );
  }

  const groups = [
    ...ROLES.map((role) => ({ label: ROLE_LABELS[role], players: missing.filter((m) => m.role === role) })),
    { label: "No character", players: missing.filter((m) => !m.role) },
  ].filter((g) => g.players.length);
  const summary = ROLES.flatMap((role) => {
    const n = missing.filter((m) => m.role === role).length;
    return n ? [rolesText(n, role)] : [];
  });

  const pingable = missing.filter((m) => m.discordId).length;
  const cooldownEnd = raid.pinged_at
    ? new Date(new Date(raid.pinged_at).getTime() + PING_COOLDOWN_MINUTES * 60_000).toISOString()
    : null;
  const coolingDown = cooldownEnd !== null && !hasStarted(cooldownEnd);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-panel/90 p-4 text-sm">
      <p>
        <strong>{missing.length}</strong> {missing.length === 1 ? "member hasn't" : "members haven't"} responded
        {summary.length > 0 && <span className="opacity-70"> ({summary.join(", ")})</span>}.
      </p>
      <dl className="space-y-1.5">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-wrap gap-x-2">
            <dt className="w-24 shrink-0 opacity-70">{g.label}</dt>
            <dd className="flex-1">
              {g.players.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ", "}
                  <Link
                    href={playerHref(m.slug)}
                    className="hover:underline"
                    style={{ color: readable(m.character?.color) }}
                  >
                    {m.character?.name ?? m.displayName}
                  </Link>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {canPing && !isLocked(raid) && pingable > 0 && (
        <form action={pingNoResponse.bind(null, raid.id)} className="flex flex-wrap items-center gap-3">
          {coolingDown ? (
            <span className="opacity-70">Pinged in Discord less than {PING_COOLDOWN_MINUTES} minutes ago.</span>
          ) : (
            <ConfirmButton
              message={`Mention ${pingable} ${pingable === 1 ? "member" : "members"} in the Discord raid channel?`}
              className="rounded bg-discord px-3 py-1.5 font-medium text-white hover:brightness-110"
            >
              Ping {pingable} in Discord
            </ConfirmButton>
          )}
        </form>
      )}
    </div>
  );
}
