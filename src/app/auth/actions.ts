"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInWithDiscord() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) throw error;
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
