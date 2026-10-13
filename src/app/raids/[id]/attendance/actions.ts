"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/wow";

// Form fields are named "status:<characterId>".
export async function saveAttendance(raidId: string, formData: FormData) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) throw new Error("Only officers can record attendance");

  const rows = [...formData.entries()]
    .filter(([key]) => key.startsWith("status:"))
    .map(([key, value]) => ({
      raid_id: raidId,
      character_id: key.slice("status:".length),
      status: String(value) as AttendanceStatus,
    }));
  if (rows.some((r) => !ATTENDANCE_STATUSES.includes(r.status))) throw new Error("Invalid status");

  const { error } = await supabase.from("attendance").upsert(rows);
  if (error) throw error;

  revalidatePath("/raids/[id]", "layout");
  revalidatePath("/attendance");
  redirect(`/raids/${raidId}/attendance?saved=1`);
}
