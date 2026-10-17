import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { InstanceSettings } from "../instance-settings";

export default async function InstancesPage() {
  const { supabase, isOfficer, isAdmin } = await requireViewer();
  if (!isOfficer) redirect("/");

  const { data: instances } = await supabase
    .from("instances")
    .select("name, size, tanks, healers, dps, reserves")
    .order("sort");
  return <InstanceSettings instances={instances ?? []} editable={isAdmin} />;
}
