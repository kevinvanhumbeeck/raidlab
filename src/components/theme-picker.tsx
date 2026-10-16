"use client";

import { THEMES, THEME_COOKIE, THEME_GROUPS, type Theme } from "@/lib/theme";

// Applies a theme right away and remembers it in a cookie so the server renders it next time.
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

// Controlled: the nav owns the current theme, since its menus mount and unmount pickers.
export function ThemePicker({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Theme)}
      aria-label="Theme"
      className="rounded border border-border bg-background px-2 py-1 text-sm"
    >
      {THEME_GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {THEMES.filter((t) => t.group === group).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
