import { Roster } from "@/components/roster";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Raid Planner</h1>
        <p className="opacity-80">Log in with Discord to register your characters and sign up for raids.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_officer")
    .eq("id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {profile?.display_name}</h1>
        {profile?.is_officer && <p className="text-sm opacity-70">You are an officer.</p>}
      </div>
      <Roster supabase={supabase} />
    </div>
  );
}
