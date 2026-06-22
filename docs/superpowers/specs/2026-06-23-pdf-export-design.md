# PDF Export — Design

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan

## Summary

Add the ability to export the active group's reconciliation as a downloadable PDF.
Itemisation already ships (`ItemsEditor`, `ExpenseItem`); this work adds **PDF
export only**. The user picks which sections to include via a modal, and a PDF
file is generated client-side and downloaded directly.

PDF generation uses `@react-pdf/renderer` (declarative React layout, direct
download). The library is heavy (~1MB), so its code is **lazy-loaded** on first
export and kept out of the initial bundle.

## Goals

- Export the active group as a PDF containing any combination of three sections:
  1. **Settle-up summary** — optimal "who pays whom" transfers + each person's net balance.
  2. **Expense list** — every expense (description, date, payer, amount, split / itemised lines).
  3. **Per-person breakdown** — for each person: total paid, total owed, net, and contributing expenses.
- Let the user toggle which of the three sections are included before downloading.
- Include a title block: group name + date generated.
- Keep the initial app bundle lean (lazy-load the PDF code).

## Non-Goals

- Receipt image embedding.
- Exporting multiple groups at once (active group only).
- Server-side rendering or any backend.
- Print-dialog / `window.print` flow (we generate a file directly).

## Architecture

Three isolated units with a clean data/presentation boundary:

```
src/export/
  report.ts          PURE  buildReport(group, sections) -> ReportData   (no react-pdf; unit-tested)
  ReconcilePdf.tsx   VIEW  <ReconcilePdf data /> renders ReportData via @react-pdf/renderer
src/components/
  ExportModal.tsx    UI    section checkboxes + Download button (lazy-imports the PDF code)
```

- **`report.ts`** converts a `Group` into a plain, serializable `ReportData`
  object by reusing the existing engine (`computeBalances`, `settle`,
  `computeExpenseShares`, `payerCredit`, `expenseTotalCents`, `formatCents`). It
  has no dependency on react-pdf and is fully testable.
- **`ReconcilePdf.tsx`** is pure presentation — it only knows how to lay out a
  `ReportData`. It can change without affecting the data builder, and vice versa.
- **`ExportModal.tsx`** wires user choices to the builder and triggers download.

### Data flow

1. User clicks **Export PDF** in the header → `ExportModal` opens.
2. User toggles sections, clicks **Download**.
3. Modal dynamically `import()`s `report.ts` + `ReconcilePdf.tsx` + `@react-pdf/renderer`.
4. `buildReport(activeGroup, selectedSections)` → `ReportData`.
5. `pdf(<ReconcilePdf data={reportData} />).toBlob()` → object URL → anchor click.
6. Filename: `Reconcile - <groupName> - <YYYY-MM-DD>.pdf`.

## `ReportData` shape

```ts
interface ReportData {
  header: { groupName: string; generatedDate: string }; // always present
  settleUp?: {
    netBalances: { name: string; cents: number }[];
    transfers: { from: string; to: string; cents: number }[];
  };
  expenses?: {
    description: string;
    date: string;            // ISO yyyy-mm-dd
    payerName: string;
    amountCents: number;
    splitSummary: string;    // e.g. "Equal among 3", "Exact", "Itemised"
    items?: { name: string; cents: number; assigneeNames: string[] }[];
  }[];
  perPerson?: {
    name: string;
    paidCents: number;       // sum of payerCredit for expenses they paid
    owedCents: number;       // sum of their computeExpenseShares across expenses
    netCents: number;        // paidCents - owedCents
    contributions: { description: string; owedCents: number }[];
  }[];
}
```

Each optional section is included only if its toggle is selected.

### Derivation notes

- **Settle-up**: `settle(computeBalances(group))` for transfers;
  `computeBalances(group)` entries for net balances. Resolve person ids → names.
- **Expenses**: iterate `group.expenses`; `splitSummary` derived from
  `splitType` / itemised state. For itemised expenses, list line items with
  their assignee names; pending (unassigned) items are shown but contribute
  nothing to balances (consistent with the engine).
- **Per-person**: for each person, `paidCents` accrues `payerCredit(expense)`
  when they are the payer; `owedCents` accrues their value from
  `computeExpenseShares(expense)`; `netCents = paidCents - owedCents`.
  `contributions` lists each expense where the person owes a non-zero share.

## Rendering

`ReconcilePdf` renders one `<Document>` → one `<Page>` containing:

1. Title block — group name (heading) + "Generated <date>".
2. Each selected section as a styled block with a section heading and a simple
   table layout (react-pdf `<View>`/`<Text>` rows). Money formatted via
   `formatCents`. Long content flows across pages via react-pdf's automatic
   pagination.

## Entry point

An **Export PDF** button in the header (`App.tsx`), next to `ThemeToggle`.
Disabled when there is no active group or the group has no people. Opens
`ExportModal`.

## Lazy loading

`@react-pdf/renderer`, `report.ts`, and `ReconcilePdf.tsx` are loaded via dynamic
`import()` inside the modal's Download handler so none of them are in the initial
chunk. The modal shows a brief "Generating…" state while the import + blob
generation runs.

## Error handling

- Download handler wraps generation in try/catch; on failure the modal shows an
  inline error message and re-enables the Download button.
- Export button is disabled when there's nothing meaningful to export
  (no active group / no people), preventing empty reports.

## Testing

- **`report.test.ts`** (primary): section toggles include/exclude correctly;
  id→name resolution; equal/exact/percent/shares and itemised expenses produce
  correct `owedCents`/`paidCents`/`netCents`; `netCents` sums to zero across
  people; pending items excluded from owed totals; empty/edge groups.
- **Smoke test**: `pdf(<ReconcilePdf data={sample} />).toBlob()` resolves to a
  non-empty Blob for a representative `ReportData`.
- Existing engine and reducer tests remain untouched.

## Dependencies

- Add `@react-pdf/renderer` to `dependencies`.
- No engine or state changes required; this feature is additive and read-only
  with respect to app state.
