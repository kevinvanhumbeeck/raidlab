import { signInWithDiscord } from "@/app/auth/actions";

export function DiscordLoginButton({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <form action={signInWithDiscord}>
      <button
        className={`rounded bg-discord font-medium text-white hover:brightness-110 ${
          size === "lg" ? "px-5 py-2.5" : "px-3 py-1.5 text-sm"
        }`}
      >
        Log in with Discord
      </button>
    </form>
  );
}
