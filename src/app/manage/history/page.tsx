import { redirect } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { Pager } from "@/components/pager";
import { historyCursor, loadHistory } from "@/lib/history";
import { requireViewer } from "@/lib/viewer";

const PAGE_SIZE = 100;

// Changes across all raids, characters and roles (#90), for admins.
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; after?: string }>;
}) {
  const { supabase, isAdmin } = await requireViewer();
  if (!isAdmin) redirect("/");

  const page = await loadHistory(supabase, { ...historyCursor(await searchParams), limit: PAGE_SIZE });
  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70">
        Changes to raids, sign-ups, comps, reserves, attendance, characters and roles, newest first, in server time.
        Each raid has its own History tab with everything for that raid.
      </p>
      <HistoryList lines={page.lines} showRaid />
      <Pager newer={page.newer ? `?after=${page.newer}` : null} older={page.older ? `?before=${page.older}` : null} />
    </div>
  );
}
