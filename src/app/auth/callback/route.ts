import { NextResponse } from "next/server";
import { isGuildMember } from "@/lib/discord";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Re-check Discord server membership on every login.
      const admin = createAdminClient();
      if (admin) {
        try {
          const member = await isGuildMember(data.session.provider_token);
          await admin.from("profiles").update({ is_member: member }).eq("id", data.user.id);
        } catch (e) {
          console.error(e);
          return NextResponse.redirect(`${origin}/?error=discord`);
        }
      } else {
        console.warn("SUPABASE_SECRET_KEY not set; Discord membership not recorded");
      }
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=login`);
}
