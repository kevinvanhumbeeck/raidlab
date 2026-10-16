import { notFound } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { loadHistory } from "@/lib/history";
import { getRaid } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";

// Everything that changed in this raid (#90), for admins.
export default async function RaidHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raid = await getRaid(slug);
  const { supabase, isAdmin } = await requireViewer();
  if (!isAdmin) notFound();

  const lines = await loadHistory(supabase, raid.id, 500);
  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70">
        Who changed what in this raid, newest first, in server time. Only admins see this. Changes by the Discord bot on
        its own show as System.
      </p>
      <HistoryList lines={lines} />
    </div>
  );
}
