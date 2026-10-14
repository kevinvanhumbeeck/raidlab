// Panel with an optional raised header strip, styled after guildmanager.app's dashboard cards.
export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`overflow-hidden rounded-xl border border-border bg-panel ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  style,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-panel-raised px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold tracking-tight" style={style}>
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

// Small tinted tile with a label, a big number and an optional hint.
export function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-accent/[0.06] px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
