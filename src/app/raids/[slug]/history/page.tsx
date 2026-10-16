import { notFound } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { Pager } from "@/components/pager";
import { historyCursor, loadHistory } from "@/lib/history";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";

const PAGE_SIZE = 100;

// Everything that changed in this raid (#90), for admins.
export default async function RaidHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ before?: string; after?: string }>;
}) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { supabase, isAdmin } = await requireViewer();
  if (!isAdmin) notFound();

  const page = await loadHistory(supabase, { raidId: raid.id, ...historyCursor(await searchParams), limit: PAGE_SIZE });
  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70">
        Who changed what in this raid, newest first, in server time. Only admins see this. Changes by the Discord bot on
        its own show as System.
      </p>
      <HistoryList lines={page.lines} />
      <Pager newer={page.newer ? `?after=${page.newer}` : null} older={page.older ? `?before=${page.older}` : null} />
    </div>
  );
}
