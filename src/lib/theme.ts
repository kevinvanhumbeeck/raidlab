export const THEMES = [
  { id: "tavern", label: "Tavern" },
  { id: "slate", label: "Slate" },
  { id: "frost", label: "Frost" },
  { id: "fel", label: "Fel" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((t) => t.id === value)?.id ?? "tavern";
}
