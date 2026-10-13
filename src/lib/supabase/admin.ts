import "server-only";
import { createClient } from "@supabase/supabase-js";

// Bypasses row level security. Only for trusted server code, e.g. recording
// Discord server membership after login.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
