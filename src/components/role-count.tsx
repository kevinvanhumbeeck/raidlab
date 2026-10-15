import type { CoverageState } from "@/lib/coverage";

const COLOR: Record<CoverageState, string> = {
  met: "text-emerald-400",
  offspec: "text-amber-400",
  short: "text-red-400",
};

// "2 / 3": green when the instance's minimum is met, amber when it's only met if players switch to an
// offspec (see roleCoverage), red when short.
export function RoleCount({
  count,
  needed,
  state,
  hint,
}: {
  count: number;
  needed?: number;
  state?: CoverageState;
  hint?: string;
}) {
  if (!needed) return <span className="tabular-nums opacity-60">{count}</span>;
  return (
    <span
      className={`tabular-nums ${COLOR[state ?? (count >= needed ? "met" : "short")]}`}
      title={[`${needed} needed`, hint].filter(Boolean).join(". ")}
    >
      {count} / {needed}
    </span>
  );
}
