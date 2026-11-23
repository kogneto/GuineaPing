/**
 * Light or dark: the Member's choice for this device, or the device's own setting when they have
 * made none. It is kept in the browser, not on the server, because it belongs to the screen in
 * front of them: a phone in bed and a laptop at a desk can differ.
 *
 * index.html applies the stored choice before the page draws, so there is no flash of the other.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = { system: "Match this device", light: "Light", dark: "Dark" };

const KEY = "guineaping.theme";

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // The choice holds until the page is closed.
  }
}
