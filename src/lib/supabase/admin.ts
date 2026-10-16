import "server-only";
import { createClient } from "@supabase/supabase-js";

// Bypasses row level security. Only for trusted server code, e.g. recording
// Discord server membership after login. actorId names the player the change is made for, e.g. a sign-up through
// a Discord button, so the audit log (#90) shows them instead of the system.
export function createAdminClient(actorId?: string) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: actorId ? { headers: { "x-raidlab-actor": actorId } } : undefined,
  });
}
