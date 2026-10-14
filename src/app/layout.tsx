import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { Cinzel, Exo_2, Geist_Mono, Zen_Dots } from "next/font/google";
import { DiscordLoginButton } from "@/components/discord-login-button";
import { ThemePicker } from "@/components/theme-picker";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getViewer } from "@/lib/viewer";
import { playerHref } from "@/lib/wow";
import { signOut } from "@/app/auth/actions";
import "./globals.css";

const exo2 = Exo_2({
  variable: "--font-exo-2",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const zenDots = Zen_Dots({
  variable: "--font-zen-dots",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.raidlab.net"),
  title: {
    default: "RaidLab — Raid Planner",
    template: "%s · RaidLab",
  },
  description: "Roster, compositions and attendance for our WoW Forever raids",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, isMember, isOfficer } = await getViewer();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme}>
      <body className={`${exo2.variable} ${geistMono.variable} ${cinzel.variable} ${zenDots.variable} font-sans antialiased`}>
        <header className="border-b border-border bg-panel">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/raidlab.svg" alt="" width={29} height={36} priority />
              <span className="font-display text-lg font-bold tracking-wide">
                Raid<span className="text-accent">Lab</span>
              </span>
            </Link>
            {isMember && (
              <>
                <Link href="/raids" className="font-heading text-sm opacity-80 hover:opacity-100">
                  Raids
                </Link>
                <Link href="/attendance" className="font-heading text-sm opacity-80 hover:opacity-100">
                  Attendance
                </Link>
                <Link href="/characters" className="font-heading text-sm opacity-80 hover:opacity-100">
                  My characters
                </Link>
                {isOfficer && (
                  <Link href="/officers" className="font-heading text-sm opacity-80 hover:opacity-100">
                    Officers
                  </Link>
                )}
              </>
            )}
            <div className="ml-auto flex items-center gap-6">
              <ThemePicker initial={theme} />
              {user && isMember && (
                <Link href={playerHref(user.id)} className="font-heading text-sm opacity-80 hover:opacity-100">
                  My profile
                </Link>
              )}
              {user ? (
                <form action={signOut} className="flex">
                  <button className="font-heading text-sm opacity-80 hover:opacity-100">Sign out</button>
                </form>
              ) : (
                <DiscordLoginButton />
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
