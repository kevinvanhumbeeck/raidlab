// "2 / 3": green when the instance's minimum is met, amber when short.
export function RoleCount({ count, needed }: { count: number; needed?: number }) {
  if (!needed) return <span className="tabular-nums opacity-60">{count}</span>;
  return (
    <span
      className={`tabular-nums ${count >= needed ? "text-emerald-400" : "text-amber-400"}`}
      title={`${needed} needed`}
    >
      {count} / {needed}
    </span>
  );
}
