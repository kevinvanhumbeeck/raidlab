import Image from "next/image";
import { DiscordLoginButton } from "@/components/discord-login-button";
import { Roster } from "@/components/roster";
import { signOut } from "@/app/auth/actions";
import { getViewer } from "@/lib/viewer";

const ERRORS: Record<string, string> = {
  login: "Logging in failed. Please try again.",
  discord: "Couldn't check your Discord server membership. Please try again.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, user, profile, isOfficer, isMember } = await getViewer();
  const errorMessage = error && ERRORS[error];

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-5 py-6 text-center">
        <Image src="/raidlab.svg" alt="RaidLab logo" width={184} height={231} priority />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">
            Raid<span className="text-accent">Lab</span>
          </h1>
          <p className="opacity-80">Raid roster, sign-ups and compositions for our WoW Forever raids.</p>
        </div>
        {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
        <DiscordLoginButton size="lg" />
        <p className="text-xs opacity-60">For members of our Discord server.</p>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Guild members only</h1>
        {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
        <p className="opacity-80">
          Hi {profile?.display_name}, this planner is for members of our Discord server. Join the server, then log out
          and log in again.
        </p>
        <form action={signOut}>
          <button className="rounded border border-border px-3 py-1.5 text-sm">Log out</button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {profile?.display_name}</h1>
        {isOfficer && <p className="text-sm opacity-70">You are an officer.</p>}
      </div>
      <Roster supabase={supabase} />
    </div>
  );
}
