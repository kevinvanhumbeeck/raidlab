export const THEMES = [
  { id: "tavern", label: "Tavern" },
  { id: "slate", label: "Slate" },
  { id: "frost", label: "Frost" },
  { id: "modern", label: "Modern" },
  { id: "horde", label: "Horde" },
  { id: "light", label: "Light" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((t) => t.id === value)?.id ?? "tavern";
}

// Class and item-quality colours are made for dark backgrounds (Priest and common items are white); themes
// set --readable-shade to darken them enough to read on a light background.
export function readable(color: string | undefined) {
  return color && `color-mix(in oklab, ${color}, black var(--readable-shade))`;
}
