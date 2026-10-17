import { redirect } from "next/navigation";
import { SectionTabs } from "@/components/section-tabs";
import { requireViewer } from "@/lib/viewer";
import { getNextRaid } from "./next-raid";

// Shared header and tabs for the officers' and admins' pages.
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { supabase, isOfficer, isAdmin } = await requireViewer();
  if (!isOfficer) redirect("/");

  const [next, { count: members }, { count: instances }] = await Promise.all([
    getNextRaid(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).or("is_member.eq.true,is_officer.eq.true"),
    supabase.from("instances").select("name", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Manage</h1>
      <SectionTabs
        base="/manage"
        tabs={[
          {
            segment: "",
            icon: "overview",
            label: "Overview",
            meta: next ? `${next.missing.length} no reply` : "",
            warn: !!next?.missing.length,
          },
          { segment: "members", icon: "members", label: "Members", meta: `${members ?? 0}` },
          {
            segment: "instances",
            icon: "instances",
            label: "Instances",
            meta: `${instances ?? 0}`,
            subpages: ["loot", "splits"],
          },
          // The audit log (#90), for admins.
          ...(isAdmin ? [{ segment: "history", icon: "history" as const, label: "History", meta: "" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
