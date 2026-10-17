import { cache } from "react";
import { noResponse } from "@/lib/no-response";
import { requireViewer } from "@/lib/viewer";

// The next raid and who hasn't responded to it, for the Overview tab and its count.
export const getNextRaid = cache(async () => {
  const { supabase } = await requireViewer();
  const { data: raid } = await supabase
    .from("raids")
    .select("id, slug, title, starts_at, locked_at, pinged_at")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  return raid ? { raid, missing: await noResponse(supabase, raid.id) } : null;
});
