# Reconcile — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design phase)

## 1. Purpose

Reconcile is a local-first web app for figuring out **who owes whom** after a group of
people share costs. You enter expenses (who paid, how much, how it splits), and the app
computes each person's **net balance** and the **minimal set of payments** needed to
settle up.

The core idea: if I pay for one thing and someone else pays for my more-expensive thing,
those debts should **net out** automatically. Reconcile makes that netting exact and then
minimizes the number of real-world transfers required to square everyone up.

## 2. Scope & Constraints

- **Single-user, local-first.** Runs in the user's browser. No accounts, no login, no
  backend server. Works offline.
- **Persistence:** browser `localStorage`. All data stays on the user's machine.
- **Multiple groups.** The user can keep several independent groups (e.g. "Ski trip",
  "Flatmates"), each with its own people and expenses.
- **Single currency.** No multi-currency or FX. Amounts are plain numbers with 2 decimal
  places, stored internally as integer cents.
- **Run target:** local dev only (`npm run dev`). Deployment is out of scope but the build
  output is static, so it can be deployed later with no code changes.

### Non-goals (YAGNI)
- No authentication, no cloud sync, no sharing links.
- No multi-currency / exchange rates.
- No receipts/photo upload, no recurring expenses, no payment integrations.
- No mobile-native app (responsive web is enough).

## 3. Tech Stack

- **React 19 + TypeScript**, bundled with **Vite**.
- **Tailwind CSS** for styling.
- **Vitest** for unit tests (engine is TDD).
- State managed with React `useReducer` + Context (no external state library needed).

## 4. Architecture

Two clean layers with a hard boundary between them:

```
┌─────────────────────────────────────────────┐
│  UI layer (React)                            │
│  components + reducer/context + persistence  │
└───────────────┬─────────────────────────────┘
                │ calls pure functions
┌───────────────▼─────────────────────────────┐
│  Engine (pure TypeScript, no React)          │
│  money.ts → balances.ts → settle.ts          │
└─────────────────────────────────────────────┘
```

The engine is where correctness matters, so it is pure (no React, no DOM, no storage) and
fully unit-tested. The UI layer is a thin shell that holds state, persists it, and renders.

## 5. Data Model

All monetary values stored as **integer cents** to avoid floating-point errors.

```ts
type ID = string;

interface Person {
  id: ID;
  name: string;
}

type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

interface SplitMember {
  personId: ID;
  // Meaning depends on split type:
  //  - equal:   value ignored (each included member is equal)
  //  - exact:   value = cents this person owes
  //  - percent: value = percentage points (sum must be 100)
  //  - shares:  value = number of shares (any positive integers)
  value: number;
}

interface Expense {
  id: ID;
  description: string;
  amountCents: number;     // total amount of the expense
  payerId: ID;             // who actually paid
  date: string;            // ISO date
  splitType: SplitType;
  members: SplitMember[];  // who this expense is split among
}

interface Group {
  id: ID;
  name: string;
  people: Person[];
  expenses: Expense[];
}

interface AppState {
  groups: Group[];
  activeGroupId: ID | null;
  schemaVersion: number;   // for future localStorage migrations
}
```

## 6. The Engine (pure modules)

### 6.1 `money.ts`
- Helpers for parsing user input (e.g. "12.50") into cents and formatting cents back to a
  display string.
- **`splitCents(total, weights[]) -> number[]`**: splits a total into integer-cent parts
  proportional to `weights`, distributing the leftover remainder pennies **deterministically**
  (largest-remainder method) so the parts always sum **exactly** to `total`. This is the
  rounding-correctness workhorse used by equal / percent / shares splits.

### 6.2 `balances.ts`
- **`computeShares(expense) -> Map<personId, cents>`**: turns one expense into how much each
  member owes for it, according to its split type (using `splitCents` for equal/percent/shares,
  raw values for exact).
- **`computeBalances(group) -> Map<personId, netCents>`**: for every person,
  `netCents = totalPaid − totalOwed`. Positive = others owe them; negative = they owe.
  The sum of all net balances is always exactly zero (invariant, asserted in tests).

### 6.3 `settle.ts`
- **`settle(balances) -> Transfer[]`** where `Transfer = { fromId, toId, amountCents }`.
- Greedy min-cash-flow: repeatedly match the largest debtor to the largest creditor,
  transfer `min(|debt|, credit)`, until everyone is at zero. Produces at most
  `n − 1` transfers, so nobody makes more transfers than necessary.

## 7. UI Layer

Single-page, single main screen, responsive.

- **Group switcher** — select / create / rename / delete groups.
- **People manager** — add/remove people in the active group.
- **Expense form** — description, amount, payer dropdown, date, participant checkboxes, and a
  **split editor** that changes with the chosen split type. Shows a live preview of each
  person's share and validates that exact/percent splits add up before allowing save.
- **Expense list** — all expenses with edit/delete.
- **Balances panel** — each person's net (owed / owes), color-coded.
- **Settle-up panel** — the minimal "X pays Y $Z" list from the engine.

### State flow
UI dispatches actions → reducer produces new `AppState` → an effect persists state to
`localStorage` → derived balances/settlement are computed from state via the engine
(memoized) on each render.

## 8. Persistence

- `storage.ts`: `load(): AppState` and `save(state): void` against a single `localStorage`
  key (`reconcile.v1`).
- On load, if data is missing/corrupt, fall back to a fresh empty state.
- `schemaVersion` recorded for future migrations (no migration logic needed at v1).

## 9. Error Handling & Edge Cases

- **Rounding:** handled centrally by `splitCents` (largest-remainder); split parts always sum
  to the total exactly.
- **Invalid splits:** exact splits whose parts don't sum to the total, or percent splits not
  summing to 100, are flagged in the form and block saving.
- **Empty member list / zero amount:** save disabled with a hint.
- **Deleting a person** referenced by expenses: warn and require confirmation (and/or block
  while they appear as a payer/member).
- **Empty states:** friendly prompts when there are no groups / people / expenses.

## 10. Testing Strategy

- **TDD on the engine.** Vitest unit tests written first for `money`, `balances`, `settle`.
  Required cases:
  - The canonical "two payments cancel out": A pays $10 for B, B pays $30 for A → net is
    A owes B $20 (and vice-versa), settled in one transfer.
  - Equal split with an indivisible total (e.g. $10.00 / 3) sums back to exactly $10.00.
  - Percent and shares splits, including remainder distribution.
  - Net balances always sum to zero.
  - `settle` produces ≤ n−1 transfers and zeroes everyone out.
- UI tests kept light (a couple of smoke/interaction tests at most).

## 11. Repository

- New folder `reconcile/` (this directory), `git init`, `.gitignore` for Node/Vite.
- `README.md` with what it is + `npm install` / `npm run dev` / `npm test` instructions.
- Committed in logical steps (scaffold → engine+tests → UI → docs).
