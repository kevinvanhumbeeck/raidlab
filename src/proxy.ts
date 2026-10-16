import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Verifies the JWT locally against the project's signing keys; only refreshing it hits Supabase.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Discord's interactions endpoint has no session and must answer within 3 seconds.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/discord|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
