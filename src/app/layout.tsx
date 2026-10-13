import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import { DiscordLoginButton } from "@/components/discord-login-button";
import { getViewer } from "@/lib/viewer";
import { playerHref } from "@/lib/wow";
import { signOut } from "@/app/auth/actions";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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

export const metadata: Metadata = {
  metadataBase: new URL("https://www.raidlab.net"),
  title: {
    default: "Breakfast at Booty Bay — Raid Planner",
    template: "%s · Breakfast at Booty Bay",
  },
  description: "Roster, compositions and attendance for Breakfast at Booty Bay's WoW Forever raids",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, isMember, isOfficer } = await getViewer();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} font-sans antialiased`}>
        <header className="border-b border-border bg-panel">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/crest-128.webp" alt="" width={36} height={36} priority />
              <span className="font-display text-base font-bold tracking-wide text-accent">Breakfast at Booty Bay</span>
            </Link>
            {isMember && (
              <>
                <Link href="/raids" className="text-sm opacity-80 hover:opacity-100">
                  Raids
                </Link>
                <Link href="/attendance" className="text-sm opacity-80 hover:opacity-100">
                  Attendance
                </Link>
                <Link href="/characters" className="text-sm opacity-80 hover:opacity-100">
                  My characters
                </Link>
                {isOfficer && (
                  <Link href="/officers" className="text-sm opacity-80 hover:opacity-100">
                    Officers
                  </Link>
                )}
              </>
            )}
            <div className="ml-auto flex items-center gap-4">
              {user && isMember && (
                <Link href={playerHref(user.id)} className="text-sm opacity-80 hover:opacity-100">
                  My profile
                </Link>
              )}
              {user ? (
                <form action={signOut}>
                  <button className="text-sm opacity-80 hover:opacity-100">Sign out</button>
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
