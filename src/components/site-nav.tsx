"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { ThemePicker, applyTheme } from "@/components/theme-picker";
import type { Theme } from "@/lib/theme";
import { useDismiss } from "@/lib/use-dismiss";

type NavLink = { href: string; label: string };

export type Account = {
  name: string;
  avatarUrl: string | null;
  // Personal pages; empty for players who aren't members.
  links: NavLink[];
};

// text-base so the links sit level with the text-lg wordmark next to the logo.
const linkClass = "nav-link w-fit font-heading text-base tracking-wide opacity-80 hover:opacity-100";
const menuItem = "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-foreground/5";

// Main links inline with an account menu on the right; one hamburger panel on mobile.
export function SiteNav({
  brand,
  links,
  account,
  theme: initialTheme,
  loginButton,
}: {
  brand: React.ReactNode;
  links: NavLink[];
  account: Account | null;
  theme: Theme;
  loginButton: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const [theme, setTheme] = useState(initialTheme);
  const changeTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  useDismiss(menuRef, menuOpen, closeMenu);
  useDismiss(navRef, mobileOpen, closeMobile);

  const mainLink = (l: NavLink, onClick?: () => void) => (
    <Link
      key={l.href}
      href={l.href}
      onClick={onClick}
      aria-current={isActive(l.href) ? "page" : undefined}
      className={`${linkClass} ${isActive(l.href) ? "text-accent opacity-100" : ""}`}
    >
      {l.label}
    </Link>
  );

  return (
    <nav ref={navRef} className="relative mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
      {brand}

      {/* Desktop */}
      {/* Centred, the text-lg wordmark's baseline sits 1px lower than the links'; nudge them onto it. */}
      <div className="hidden translate-y-px items-center gap-6 sm:flex">{links.map((l) => mainLink(l))}</div>
      <div className="ml-auto hidden items-center gap-4 sm:flex">
        {account ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-foreground/5"
            >
              <Avatar account={account} />
              <span className="font-heading text-sm">{account.name}</span>
              <Chevron open={menuOpen} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-panel py-1 shadow-xl"
              >
                {account.links.map((l) => (
                  <Link key={l.href} href={l.href} role="menuitem" onClick={closeMenu} className={menuItem}>
                    {l.label}
                  </Link>
                ))}
                <ThemeRow theme={theme} onChange={changeTheme} />
                <div className="my-1 border-t border-border" />
                <form action={signOut}>
                  <button role="menuitem" className={menuItem}>
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <>
            <ThemePicker value={theme} onChange={changeTheme} />
            {loginButton}
          </>
        )}
      </div>

      {/* Mobile */}
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((o) => !o)}
        className="ml-auto rounded-lg p-2 hover:bg-foreground/5 sm:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-30 border-b border-border bg-panel px-4 py-3 shadow-xl sm:hidden">
          {links.length > 0 && (
            <div className="flex flex-col gap-3 pb-3">{links.map((l) => mainLink(l, closeMobile))}</div>
          )}
          <div className={`flex flex-col gap-3 ${links.length > 0 ? "border-t border-border pt-3" : ""}`}>
            {account ? (
              <>
                <div className="flex items-center gap-2">
                  <Avatar account={account} />
                  <span className="font-heading text-sm">{account.name}</span>
                </div>
                {account.links.map((l) => mainLink(l, closeMobile))}
                <ThemeRow theme={theme} onChange={changeTheme} />
                <form action={signOut}>
                  <button className={linkClass}>Sign out</button>
                </form>
              </>
            ) : (
              <>
                <ThemeRow theme={theme} onChange={changeTheme} />
                <div>{loginButton}</div>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function ThemeRow({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm max-sm:px-0">
      <span className="opacity-80">Theme</span>
      <ThemePicker value={theme} onChange={onChange} />
    </label>
  );
}

function Avatar({ account }: { account: Account }) {
  return account.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={account.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
  ) : (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-border text-xs font-semibold">
      {account.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
