// Grouped in the picker: plain palettes first, then the ones with a background image.
export const THEMES = [
  { id: "tavern", label: "Tavern", group: "Classic" },
  { id: "slate", label: "Slate", group: "Classic" },
  { id: "frost", label: "Frost", group: "Classic" },
  { id: "light", label: "Light", group: "Classic" },
  { id: "modern", label: "Modern", group: "Artwork" },
  { id: "alliance", label: "Alliance", group: "Artwork" },
  { id: "horde", label: "Horde", group: "Artwork" },
  { id: "illidan", label: "Illidan", group: "Artwork" },
] as const;

export const THEME_GROUPS = ["Classic", "Artwork"] as const;

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
