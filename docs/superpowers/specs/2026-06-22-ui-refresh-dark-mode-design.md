# Reconcile — UI Refresh & Dark Mode (Design Spec)

**Date:** 2026-06-22
**Status:** Approved (design phase)
**Extends:** `2026-06-20-reconcile-design.md`
**Builds with:** `2026-06-20-itemized-expenses-design.md` (single combined build)

## 1. Purpose

Give Reconcile a cleaner, more modern look and a dark mode. This is a re-skin plus a
theming system: component structure and logic are unchanged; every component is restyled to a
shared **design-token** system that supports light and dark themes. The itemized-expenses /
receipt-photo feature is built in this new style at the same time so nothing is styled twice.

## 2. Visual Direction — "Refined minimal"

- **Neutral gray scale**, generous whitespace, **hairline (low-contrast) borders**, soft
  elevation on cards (very subtle shadow), medium corner radius (`rounded-lg`/`xl`, not pill
  everywhere).
- **One restrained accent: indigo** — used for active tabs, primary buttons, focus rings.
- **Semantic status colors:** positive/“is owed” = emerald, negative/“owes” = rose, pending
  (unallocated items) = amber. Each defined per theme for adequate contrast.
- **Typography:** clear hierarchy; small **uppercase, letter-spaced, muted section labels**
  (e.g. `PEOPLE`, `BALANCES`); comfortable line heights.
- **Money uses tabular figures** (`font-variant-numeric: tabular-nums`) so amounts align in
  columns.
- Group tabs and people render as **pills/chips**; consistent button and input styling.

## 3. Theming System (tokens)

Use **CSS custom properties** for all semantic colors so components reference tokens, not
hardcoded shades. Toggling a single `.dark` class on `<html>` swaps the variable values, which
recolors the whole app with no per-component `dark:` duplication.

- In `src/index.css`:
  - Define tokens under `:root` (light) and `.dark` (dark): `--bg`, `--surface`,
    `--surface-2` (raised), `--border`, `--fg`, `--fg-muted`, `--accent`, `--accent-fg`,
    `--positive`, `--negative`, `--warning`, plus matching `-subtle` background variants for
    status chips.
  - Map them into Tailwind v4's theme with `@theme { --color-bg: var(--bg); ... }` so
    utilities like `bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-app`,
    `text-accent`, `bg-accent` exist and work in both themes automatically.
  - Register the class-based dark variant: `@custom-variant dark (&:where(.dark, .dark *));`
    for the rare cases a component needs an explicit `dark:` tweak (e.g. shadow strength).
- Tokens are chosen for **WCAG AA-ish contrast** in both themes (muted text still readable;
  status colors distinguishable).

## 4. Theme State & Toggle

- `src/theme/ThemeContext.tsx`:
  - `ThemeProvider` holds `theme: "light" | "dark" | "system"` (default `"system"`),
    persisted to `localStorage` key **`reconcile.theme`**.
  - Resolves the effective theme via `window.matchMedia("(prefers-color-scheme: dark)")`,
    applies/removes `.dark` on `document.documentElement`, and **subscribes to system
    changes** while in `"system"` mode.
  - `useTheme()` returns `{ theme, resolvedTheme, setTheme, cycle }`.
- `src/components/ThemeToggle.tsx`: a header control (sun / moon / “auto” icon) that switches
  the theme; current state is reflected and remembered.
- **No flash of wrong theme (FOUC):** a tiny inline script in `index.html` `<head>` reads
  `localStorage["reconcile.theme"]` (and system preference) and sets the `.dark` class on
  `<html>` **before first paint**. The React provider then takes over without changing the
  result.

## 5. Scope of Restyle (every component)

All existing components are restyled to the token system and the refined-minimal look; logic
and props are unchanged:

- **App shell**: max-width container, refined spacing; a header with the app title, the
  **ThemeToggle**, and group controls; responsive two-column workspace (stacks on mobile).
- **GroupSwitcher**: indigo-active pill tabs; new-group / rename / delete controls as buttons.
- **PeopleManager**: people as chips with subtle remove affordance; clean add input.
- **ExpenseForm / SplitEditor**: token-based inputs, segmented split-type control, primary
  (indigo) submit; clear validation states.
- **ExpenseList**: tidy rows, muted metadata, status-colored badges.
- **BalancesPanel / SettlePanel**: tabular money, emerald/rose semantics, calm empty states.

New itemized components (**ItemsEditor**, **ReceiptUpload**) and the receipt **lightbox**,
plus the **pending** badges/banner, are authored directly in this style.

## 6. Integration With the Itemized Feature

This spec and `2026-06-20-itemized-expenses-design.md` are delivered by **one** multi-agent
workflow:

1. **Foundation** (parallel, disjoint files): theme system (tokens + provider + toggle +
   no-FOUC script); engine additions (`types.ts`, `balances.ts` + tests); state additions
   (`storage.ts` sanitize, `reducer.ts` person/image cleanup, `imageStore.ts` IndexedDB).
2. **UI** (parallel, disjoint clusters): all components restyled + the new itemized/receipt UI.
3. **Integrate**: `App.tsx` + `main.tsx` (wrap in `ThemeProvider` + `AppProvider`), final
   `index.css`, get `npm run build` and `npm run test` green; commit in logical stages.
4. **Review** (adversarial): engine correctness; theme correctness (no FOUC, system-follow,
   persistence, every surface themed — no hardcoded light-only colors, AA contrast);
   UX/edge (receipt upload + cleanup, pending flags); build health.
5. **Fix**: apply confirmed findings; re-verify; commit.

## 7. Error Handling & Edge Cases

- **No-FOUC script** must be defensive: wrapped in try/catch, never throws, falls back to
  light if storage/matchMedia is unavailable.
- **System-preference changes** propagate only while in `"system"` mode; an explicit choice
  wins and persists.
- **Reduced motion**: keep transitions subtle; respect `prefers-reduced-motion` for the
  theme transition (no large animated flashes).
- No hardcoded `bg-white` / `text-slate-900` left behind — a review lens specifically hunts
  for un-themed colors that would break dark mode.

## 8. Testing Strategy

- Engine/itemized logic covered by the itemized spec's Vitest cases (extended in this build).
- Theme logic kept light: the provider's pure helpers (resolve effective theme from
  `theme` + system flag; class to apply) are factored so they can be unit-tested without a
  DOM if practical; otherwise verified via review. No heavy DOM/E2E harness is added.
- `npm run build` (tsc + vite) and `npm run test` must pass at integrate and after fixes.

## 9. Delivery / Conventions

Commit in logical stages with plain messages. The app keeps its data in the browser
and uses Tailwind v4 tokens without a UI component library or CSS-in-JS.
