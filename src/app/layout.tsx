import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { Exo_2, Zen_Dots } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DiscordLoginButton } from "@/components/discord-login-button";
import { SiteNav } from "@/components/site-nav";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getViewer } from "@/lib/viewer";
import { playerHref } from "@/lib/wow";
import "./globals.css";

const exo2 = Exo_2({
  variable: "--font-exo-2",
  subsets: ["latin"],
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
  const { user, profile, isMember, isOfficer } = await getViewer();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const links = isMember
    ? [
        { href: "/raids", label: "Raids" },
        { href: "/attendance", label: "Attendance" },
        ...(isOfficer ? [{ href: "/manage", label: "Manage" }] : []),
      ]
    : [];

  return (
    <html lang="en" data-theme={theme}>
      <body className={`${exo2.variable} ${zenDots.variable} font-sans antialiased`}>
        <header className="sticky top-0 z-40 border-b border-border bg-panel">
          <SiteNav
            brand={
              <Link href="/" className="flex shrink-0 items-center gap-2.5">
                <Image src="/raidlab.svg" alt="" width={29} height={36} priority />
                <span className="font-heading text-lg tracking-wide">
                  Raid<span className="text-accent">Lab</span>
                </span>
              </Link>
            }
            links={links}
            account={
              user && {
                name: profile?.display_name ?? "Account",
                avatarUrl: profile?.avatar_url ?? null,
                links: isMember
                  ? [
                      { href: playerHref(profile?.slug ?? user.id), label: "My profile" },
                      { href: "/characters", label: "My characters" },
                    ]
                  : [],
              }
            }
            theme={theme}
            loginButton={<DiscordLoginButton />}
          />
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
