import { botEnabled, sendReminder } from "@/lib/discord-bot";
import { noResponse } from "@/lib/no-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocked } from "@/lib/wow";

// Sign-up reminders (#59): called every few minutes by the reminders workflow. Raids starting within
// REMINDER_HOURS that are still open get one DM to every member who hasn't responded and hasn't turned the DMs
// off. Raids lock 1 hour before the start, so this leaves an hour to answer.
const REMINDER_HOURS = 2;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin || !botEnabled()) return Response.json({ skipped: "The Discord bot isn't configured" });

  const now = Date.now();
  const { data: raids, error } = await admin
    .from("raids")
    .select("id, slug, title, starts_at, locked_at")
    .is("reminded_at", null)
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + REMINDER_HOURS * 3_600_000).toISOString());
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const raid of raids ?? []) {
    if (isLocked(raid)) continue;
    // Claim the raid first, so overlapping runs don't remind twice.
    const { data: claimed } = await admin
      .from("raids")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", raid.id)
      .is("reminded_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const recipients = (await noResponse(admin, raid.id)).filter((m) => m.discordId && m.discordDms);
    let sent = 0;
    for (const m of recipients) if (await sendReminder(raid, m.discordId!)) sent++;
    results.push({ raid: raid.slug, sent, failed: recipients.length - sent });
  }
  return Response.json({ reminded: results });
}
