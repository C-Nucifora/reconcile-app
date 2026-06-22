export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "reconcile.theme";

/**
 * Resolve the effective theme to apply.
 * - "light" / "dark" are honored directly.
 * - "system" follows the OS preference flag.
 */
export function resolveTheme(
  choice: ThemeChoice,
  systemPrefersDark: boolean
): "light" | "dark" {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}
