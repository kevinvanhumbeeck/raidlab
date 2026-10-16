// Shown instantly on navigation while the page's data loads.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded bg-border" />
      <div className="h-64 rounded-xl border border-border bg-panel" />
    </div>
  );
}
