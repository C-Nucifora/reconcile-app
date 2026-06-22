# Reconcile — Itemized Expenses & Receipt Photos (Design Spec)

**Date:** 2026-06-20
**Status:** Approved (design phase)
**Extends:** `2026-06-20-reconcile-design.md`

## 1. Purpose

Let a user itemize an expense into individual line items, attach a receipt photo for
reference, and **leave some items unallocated** — flagged for the user to divvy up between
people later. This supports the common flow: snap the receipt, type the items in now,
figure out who had what afterwards.

## 2. Requirements

- **Itemized expenses.** An expense can optionally hold a list of line items, each with a
  name, price, and the set of people who shared it. Per item the cost splits **equally**
  among its assignees.
- **Deferred allocation.** An item with no assignees is *pending* — entered but not yet
  divvied up. Pending items are visibly **flagged** on the expense and summarized at the
  group level so the user remembers to allocate them.
- **Receipt photo.** A photo can be attached to an expense for reference (no OCR). It is
  compressed in the browser and stored locally; shown as a tappable thumbnail.
- **Backward compatible.** Existing (non-itemized) expenses keep working unchanged.
- **Local-first / private.** No backend, no network. Photos never leave the machine.

### Non-goals (YAGNI)
- No OCR / automatic line-item extraction from the photo.
- No per-item percentage/shares/exact splits — items split equally among assignees only.
- No multi-photo galleries — one receipt image per expense.
- No tax/tip fields — model tax or tip as ordinary line items if desired.

## 3. Core Behavior — Balances

The engine's invariant is that every person's net balance sums to **exactly zero**. Items
that have not been allocated must not break that, so:

- **Only assigned items affect balances.** For an itemized expense the payer is credited the
  **allocated total** (the sum of items that have at least one assignee), and each assigned
  item is split equally among its assignees and debited to them. Debits sum to the allocated
  total, so the expense nets to zero.
- **Unassigned items are excluded entirely** from balances — neither credited nor debited.
- The unassigned amount is surfaced as a **pending** flag (`pendingCents`), not folded into
  anyone's balance.

Once the user assigns a previously-pending item, it folds into the balances automatically on
the next render. A normal (non-itemized) expense behaves exactly as before: payer credited
`amountCents`, members debited per the chosen split type.

For an itemized expense, the displayed **total equals the sum of all its items** (assigned +
unassigned). `amountCents` is kept in sync with that sum.

## 4. Data Model (additive)

```ts
interface ExpenseItem {
  id: ID;
  name: string;
  amountCents: number;     // price of this single line item
  assigneeIds: ID[];       // people sharing this item equally; [] = unassigned (pending)
}

// Expense gains two OPTIONAL fields (everything else unchanged):
interface Expense {
  // ...existing fields...
  items?: ExpenseItem[];   // present & non-empty => itemized expense
  receiptImageId?: ID;     // reference to a stored receipt image (IndexedDB key)
}
```

- An expense is **itemized** iff `items` is present and non-empty. For itemized expenses
  `members` is `[]` and `splitType` is irrelevant (kept as `"equal"` for type validity).
- `receiptImageId` may be present on any expense (itemized or not).

## 5. Image Storage

localStorage is string-only and small (~5 MB), so images are **not** stored there.

- A small async wrapper `src/lib/imageStore.ts` manages an **IndexedDB** object store
  (`reconcile-images`) keyed by id, holding compressed image Blobs.
  - `putImage(blob): Promise<ID>` — store and return a new id.
  - `getImageURL(id): Promise<string | null>` — returns an object URL for display.
  - `deleteImage(id): Promise<void>`.
- On upload, the file is drawn to a canvas, resized so its longest edge is ≤ ~1600px, and
  exported as JPEG (quality ~0.8) before storing, to keep blobs small and the UI snappy.
- The app's main state (localStorage) holds only `receiptImageId` strings, so existing
  persistence (`storage.ts`) is unchanged apart from validation (below). Object URLs are
  revoked on unmount to avoid leaks.
- If an image read fails or the id is missing, the UI degrades gracefully (no thumbnail,
  no error thrown).

## 6. Engine Changes (`src/engine/balances.ts`, pure + tested)

- `computeExpenseShares(expense)`: when `items` is non-empty, ignore `members`; for each
  **assigned** item, split its `amountCents` equally among `assigneeIds` (via `splitCents`)
  and accumulate per-person debits. Unassigned items contribute nothing. Result still sums
  to the allocated total.
- New `payerCredit(expense): number` — `amountCents` for a normal expense; the **allocated
  total** for an itemized one. `computeBalances` credits the payer via this so nets stay zero.
- New `pendingCents(expense): number` — sum of `amountCents` over unassigned items (0 for
  non-itemized).
- New `expenseTotalCents(expense): number` — `amountCents` normally; `sum(items)` when
  itemized (a display helper; kept equal to `amountCents` in practice).
- `settle.ts` and `money.ts` are unchanged.

## 7. State / Reducer Changes

- New actions to edit an itemized expense's items and receipt without re-typing the whole
  expense are **not** required — `UPDATE_EXPENSE` already replaces an expense wholesale, and
  the form builds the full `Expense` (including `items` and `receiptImageId`). So the
  reducer surface is unchanged; only `ADD_EXPENSE` / `UPDATE_EXPENSE` payloads now carry the
  optional fields.
- `REMOVE_PERSON` already purges a person from `members`; it must **also** remove the person
  from every item's `assigneeIds` (an item that loses all assignees becomes pending rather
  than being deleted).
- `DELETE_EXPENSE` (and deleting an itemized expense) should delete its `receiptImageId`
  blob from IndexedDB (best-effort, fire-and-forget) to avoid orphaned images.
- `sanitizeState` (load/import validation) must accept itemized expenses: an expense is valid
  if it has a non-empty `members` **or** a non-empty `items`. Within items, drop
  `assigneeIds` that reference unknown people; coerce bad amounts; keep `receiptImageId` only
  if it is a string (the blob may or may not exist — handled gracefully at display time).

## 8. UI Changes

- **ExpenseForm**: add an **Itemize** toggle. When on, the single-amount + split editor is
  replaced by the **ItemsEditor**; the expense total becomes the sum of items (read-only
  display). A **ReceiptUpload** widget is available in both modes.
- **ItemsEditor** (new, `src/components/ItemsEditor.tsx`): rows of `{ name, price }` plus a
  row of **person toggle chips** per item — tap the people who shared it; lit chips split the
  item equally; all-off = pending (the row is flagged amber). Add/remove item rows. Live
  footer: **Total $X · Pending $Y (N items)**.
- **ReceiptUpload** (new, `src/components/ReceiptUpload.tsx`): file input (accepts images,
  `capture` hint for mobile camera), compresses + stores via `imageStore`, shows a thumbnail
  with view (modal/lightbox) and remove actions.
- **ExpenseList**: itemized rows show an item count and a 📎 indicator when a receipt is
  attached (tap to view); an amber **⚑ pending: $Y (N)** badge when any item is unassigned.
- **BalancesPanel**: a compact banner when the active group has pending items —
  *"$X across N items not yet allocated"* — so it is clear the balances are partial.

## 9. Error Handling & Edge Cases

- **All items pending:** allowed; the expense contributes nothing to balances and is fully
  flagged. Saving requires at least one item with a name and a positive price.
- **Item with price but no name / zero price:** blocked in the form with an inline hint.
- **Removing a person** assigned to items: they are stripped from those items (items may
  become pending); consistent with the existing person-removal guard/confirmation.
- **Per-item rounding:** handled by `splitCents`, so each item's shares sum to its price
  exactly.
- **Missing/failed image:** thumbnail simply does not render; no crash.
- **Quota errors** writing an image: caught; the expense still saves without the photo and
  the user is told the image could not be stored.

## 10. Testing Strategy

Extend the Vitest engine suite (`balances.test.ts`):
- Itemized expense with all items assigned nets to zero; payer credited the allocated total.
- Mixed assigned + unassigned: unassigned excluded; `pendingCents` correct; nets still zero.
- All-pending expense contributes nothing.
- Per-item equal split with an indivisible price sums back to the item price exactly.
- Shared item across multiple assignees splits equally.
- `payerCredit` and `expenseTotalCents` for itemized vs. normal expenses.
- `sanitizeState` keeps itemized expenses and strips unknown assignees (reducer/storage test).

UI/IndexedDB kept light (IndexedDB is not exercised in the node-environment engine tests; the
image store is isolated behind its async interface).

## 11. Delivery

- Build via a multi-agent workflow (user-selected): scaffold the frozen additions to the
  contract, fan out engine / state / UI work on disjoint files, integrate, then an
  adversarial review (engine correctness, image-store robustness, UX/edge cases) and a fix
  pass. Commit in logical stages, plain messages, no AI/co-author trailers, identity
  C-Nucifora <143251500+C-Nucifora@users.noreply.github.com>.
