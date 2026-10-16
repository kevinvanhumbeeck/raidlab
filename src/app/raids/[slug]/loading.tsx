// Inside the raid layout, so the header and tabs stay put while a tab's data loads.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-48 rounded-xl border border-border bg-panel" />
      <div className="h-32 rounded-xl border border-border bg-panel" />
    </div>
  );
}
