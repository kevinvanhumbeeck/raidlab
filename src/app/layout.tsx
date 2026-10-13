import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { signInWithDiscord, signOut } from "@/app/auth/actions";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Raid Planner",
  description: "Roster, compositions and attendance for our WoW Forever raids",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="border-b border-border bg-panel">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold">
              Raid Planner
            </Link>
            {user && (
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
              </>
            )}
            <div className="ml-auto">
              {user ? (
                <form action={signOut}>
                  <button className="text-sm opacity-80 hover:opacity-100">Sign out</button>
                </form>
              ) : (
                <form action={signInWithDiscord}>
                  <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white">
                    Log in with Discord
                  </button>
                </form>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
