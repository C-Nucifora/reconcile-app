# Reconcile

A local-first web app for figuring out **who owes whom** after a group shares costs.

Enter expenses (who paid, how much, how it splits) and Reconcile computes each person's
**net balance** and the **minimal set of payments** needed to settle up. If you pay for one
thing and someone else pays for your more-expensive thing, the debts **net out**
automatically — and the settle-up plan never asks anyone to make more transfers than
necessary.

Everything runs in your browser. No accounts, no server, no data leaves your machine.

## Features

- **Multiple groups** — keep separate tabs like "Ski trip" and "Flatmates", each with its
  own people and expenses.
- **Flexible splits** — split each expense **equally**, by **exact amounts**, by
  **percentage**, or by **shares**, with live validation that the split adds up.
- **Net balances** — see at a glance who is owed and who owes.
- **Minimal settle-up** — a short "X pays Y $Z" list computed with a greedy min-cash-flow
  algorithm.
- **Exact money math** — all amounts are handled in integer cents with deterministic
  remainder distribution, so splits always sum to the total exactly (no floating-point
  rounding drift).
- **Local persistence** — your data is saved in the browser's `localStorage` and survives
  refreshes. Works offline.

## Tech stack

React 19 + TypeScript, bundled with Vite. Tailwind CSS v4 for styling. State via
`useReducer` + Context. Unit tests with Vitest. No backend.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (prints a local URL to open)
```

Then open the printed `localhost` URL in your browser.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload. |
| `npm run build` | Type-check (`tsc --noEmit`) and produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run test` | Run the unit test suite once. |
| `npm run test:watch` | Run tests in watch mode. |

## How it works

The code is split into two layers with a hard boundary:

- **A pure calculation engine** (`src/engine/`) — `money.ts` (cents parsing/formatting and
  the largest-remainder `splitCents`), `balances.ts` (per-person net balances), and
  `settle.ts` (minimal transfers). No React, no DOM — just functions, fully unit-tested.
- **A React UI layer** (`src/components/`, `src/state/`) — holds app state, persists it to
  `localStorage`, and renders the group switcher, people manager, expense form with split
  editor, expense list, and the balances and settle-up panels.

## Project layout

```
src/
  engine/        pure calculation engine (money, balances, settle) + tests
  state/         reducer, actions, context, localStorage persistence
  components/    UI: GroupSwitcher, PeopleManager, ExpenseForm, SplitEditor,
                 ExpenseList, BalancesPanel, SettlePanel
  lib/           small helpers (id generation)
  types.ts       shared domain types
  App.tsx        layout that wires it all together
docs/            design spec
```

## Notes

This is a single-user, local-first app: data is stored only in your browser and is not
synced anywhere. Clearing site data / `localStorage` will remove your groups and expenses.
