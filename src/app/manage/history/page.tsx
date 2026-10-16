import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { HistoryList } from "@/components/history-list";
import { loadHistory } from "@/lib/history";
import { requireViewer } from "@/lib/viewer";

const LIMIT = 300;

// The latest changes across all raids, characters and roles (#90), for admins.
export default async function HistoryPage() {
  const { supabase, isAdmin } = await requireViewer();
  if (!isAdmin) redirect("/");

  const lines = await loadHistory(supabase, null, LIMIT);
  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <Breadcrumbs items={[{ label: "Manage", href: "/manage" }, { label: "History" }]} />
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm opacity-70">
          The last {LIMIT} changes to raids, sign-ups, comps, reserves, attendance, characters and roles, newest first,
          in server time. Each raid has its own History tab with everything for that raid.
        </p>
      </section>
      <HistoryList lines={lines} showRaid />
    </div>
  );
}
