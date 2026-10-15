import type { CoverageState } from "@/lib/coverage";

export type RoleCountState = CoverageState | "over";

const COLOR: Record<RoleCountState, string> = {
  met: "text-emerald-400",
  offspec: "text-amber-400",
  over: "text-amber-400",
  short: "text-red-400",
};

// "2 / 3": green when the instance's tank or healer count is met, amber when it's only met if players switch
// to an offspec (see roleCoverage) or when there are too many, red when short. Without a state (DPS, which is
// the rest of the raid) it's a plain count.
export function RoleCount({
  count,
  needed,
  state,
  hint,
}: {
  count: number;
  needed?: number;
  state?: RoleCountState;
  hint?: string;
}) {
  if (!needed) return <span className="tabular-nums opacity-60">{count}</span>;
  return (
    <span
      className={`tabular-nums ${state ? COLOR[state] : "opacity-60"}`}
      title={[state ? `${needed} needed` : `${needed} left for this role`, hint].filter(Boolean).join(". ")}
    >
      {count} / {needed}
    </span>
  );
}
