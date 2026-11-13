import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { resolveTheme, THEME_KEY, type ThemeChoice } from "./theme";

interface ThemeContextValue {
  theme: ThemeChoice;
  resolvedTheme: "light" | "dark";
  setTheme: (c: ThemeChoice) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isThemeChoice(stored)) return stored;
  } catch {
    // localStorage unavailable; fall through to default.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

function subscribeSystemPreference(onChange: () => void): () => void {
  try {
    const mql = window.matchMedia(DARK_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

function applyDarkClass(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider(props: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStoredChoice());
  const prefersDark = useSyncExternalStore(
    subscribeSystemPreference,
    systemPrefersDark,
    () => false,
  );

  const resolvedTheme = resolveTheme(theme, prefersDark);

  // Apply the resolved theme to <html> whenever it changes.
  useEffect(() => {
    applyDarkClass(resolvedTheme);
  }, [resolvedTheme]);

  // Persist the explicit choice.
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Persisting is best-effort; ignore storage failures.
    }
  }, [theme]);

  const setTheme = useCallback((c: ThemeChoice) => {
    setThemeState(c);
  }, []);

  const cycle = useCallback(() => {
    setThemeState((current) => {
      if (current === "light") return "dark";
      if (current === "dark") return "system";
      return "light";
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, cycle }),
    [theme, resolvedTheme, setTheme, cycle]
  );

  return (
    <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
