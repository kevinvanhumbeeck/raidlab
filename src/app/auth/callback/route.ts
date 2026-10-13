import { NextResponse } from "next/server";
import { discordAccess } from "@/lib/discord";
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
      // Re-check Discord server membership and roles on every login.
      const admin = createAdminClient();
      if (admin) {
        try {
          const access = await discordAccess(data.session.provider_token);
          const update: { is_member: boolean; is_officer?: boolean } = {
            is_member: access.member,
          };
          if (access.officer !== null) {
            update.is_officer = access.officer;
            // Never demote the last officer, e.g. when the role IDs are misconfigured.
            if (!access.officer) {
              const { count } = await admin
                .from("profiles")
                .select("id", { count: "exact", head: true })
                .eq("is_officer", true)
                .neq("id", data.user.id);
              if (!count) delete update.is_officer;
            }
          }
          const { error: updateError } = await admin.from("profiles").update(update).eq("id", data.user.id);
          if (updateError) throw updateError;
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
