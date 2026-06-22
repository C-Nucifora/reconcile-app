import { useTheme } from "../theme/ThemeContext";
import type { ThemeChoice } from "../theme/theme";

const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Icon({ choice }: { choice: ThemeChoice }) {
  if (choice === "light") return <SunIcon />;
  if (choice === "dark") return <MoonIcon />;
  return <AutoIcon />;
}

export default function ThemeToggle() {
  const { theme, resolvedTheme, cycle } = useTheme();
  const label = LABELS[theme];
  const title =
    theme === "system"
      ? `Theme: System (${resolvedTheme}). Click to switch.`
      : `Theme: ${label}. Click to switch.`;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${label}. Activate to change theme.`}
      title={title}
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <Icon choice={theme} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
