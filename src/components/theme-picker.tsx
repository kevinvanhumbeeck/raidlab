"use client";

import { useState } from "react";
import { THEMES, THEME_COOKIE, type Theme } from "@/lib/theme";

export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  function change(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <select
      value={theme}
      onChange={(e) => change(e.target.value as Theme)}
      aria-label="Theme"
      className="rounded border border-border bg-background px-2 py-1 text-sm"
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
