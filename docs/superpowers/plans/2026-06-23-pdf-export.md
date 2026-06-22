# PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users export the active group's reconciliation (any combination of settle-up summary, expense list, per-person breakdown) as a downloadable PDF.

**Architecture:** A pure data builder (`report.ts`) turns a `Group` into a serializable `ReportData` by reusing the existing engine. A presentation component (`ReconcilePdf.tsx`) lays out a `ReportData` with `@react-pdf/renderer`. An `ExportModal` lets the user pick sections and triggers a client-side blob download, lazy-loading the PDF code so it stays out of the initial bundle.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `@react-pdf/renderer`.

## Global Constraints

- Money values are integer **cents**; format for display with `formatCents(cents)` from `src/engine/money.ts`, which returns e.g. `"12.34"` (no currency symbol). Prefix `$` in display, matching the existing UI.
- Reuse the engine — do **not** reimplement balance/settlement math: `computeBalances`, `settle`, `computeExpenseShares`, `payerCredit`, `expenseTotalCents`.
- `report.ts` MUST NOT import `@react-pdf/renderer` (keeps it pure and unit-testable).
- `buildReport` MUST be deterministic — the generation date is passed in, never read from `Date` inside it.
- Feature is additive and read-only with respect to app state; no engine/reducer/state changes.
- Tests use Vitest (`describe/it/expect`, `globals: true`), node environment.
- Run `npm run typecheck` and `npm run lint` clean before each commit.

---

### Task 1: Pure report builder (`report.ts`)

**Files:**
- Create: `src/export/report.ts`
- Test: `src/export/report.test.ts`

**Interfaces:**
- Consumes: `computeBalances(group)`, `computeExpenseShares(expense)`, `payerCredit(expense)`, `expenseTotalCents(expense)` from `src/engine/balances.ts`; `settle(balances)` from `src/engine/settle.ts`; types from `src/types.ts` (`Group`, `ID`, `Expense`, `Transfer`).
- Produces:
  - `interface ReportSections { settleUp: boolean; expenses: boolean; perPerson: boolean }`
  - `interface ReportData { header: { groupName: string; generatedDate: string }; settleUp?: { netBalances: { name: string; cents: number }[]; transfers: { from: string; to: string; cents: number }[] }; expenses?: { description: string; date: string; payerName: string; amountCents: number; splitSummary: string; items?: { name: string; cents: number; assigneeNames: string[] }[] }[]; perPerson?: { name: string; paidCents: number; owedCents: number; netCents: number; contributions: { description: string; owedCents: number }[] }[] }`
  - `function buildReport(group: Group, opts: { sections: ReportSections; generatedDate: string }): ReportData`

- [ ] **Step 1: Write the failing test**

Create `src/export/report.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReport } from "./report";
import type { Group } from "../types";

function group(): Group {
  return {
    id: "g1",
    name: "Trip",
    people: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bob" },
    ],
    expenses: [
      {
        id: "e1",
        description: "Dinner",
        amountCents: 2000,
        payerId: "a",
        date: "2026-06-20",
        splitType: "equal",
        members: [
          { personId: "a", value: 0 },
          { personId: "b", value: 0 },
        ],
      },
      {
        id: "e2",
        description: "Snacks",
        amountCents: 1000,
        payerId: "b",
        date: "2026-06-21",
        splitType: "equal",
        members: [],
        items: [
          { id: "i1", name: "Chips", amountCents: 600, assigneeIds: ["a"] },
          { id: "i2", name: "Soda", amountCents: 400, assigneeIds: [] },
        ],
      },
    ],
  };
}

const ALL = { settleUp: true, expenses: true, perPerson: true };

describe("buildReport", () => {
  it("always includes a header with group name and the passed date", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    expect(r.header).toEqual({ groupName: "Trip", generatedDate: "2026-06-23" });
  });

  it("omits sections whose toggle is false", () => {
    const r = buildReport(group(), {
      sections: { settleUp: true, expenses: false, perPerson: false },
      generatedDate: "2026-06-23",
    });
    expect(r.settleUp).toBeDefined();
    expect(r.expenses).toBeUndefined();
    expect(r.perPerson).toBeUndefined();
  });

  it("resolves ids to names in settle-up transfers and net balances", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    // Ann paid 2000, owes 1000 (dinner half) + 600 (chips) = 1600 -> net +400
    // Bob paid 1000 (only assigned items credit = 600), owes 1000 (dinner half) -> net -400
    expect(r.settleUp!.netBalances).toEqual([
      { name: "Ann", cents: 400 },
      { name: "Bob", cents: -400 },
    ]);
    expect(r.settleUp!.transfers).toEqual([
      { from: "Bob", to: "Ann", cents: 400 },
    ]);
  });

  it("lists itemised line items with assignee names and a split summary", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    const snacks = r.expenses!.find((e) => e.description === "Snacks")!;
    expect(snacks.splitSummary).toBe("Itemised");
    expect(snacks.payerName).toBe("Bob");
    expect(snacks.items).toEqual([
      { name: "Chips", cents: 600, assigneeNames: ["Ann"] },
      { name: "Soda", cents: 400, assigneeNames: [] },
    ]);
    const dinner = r.expenses!.find((e) => e.description === "Dinner")!;
    expect(dinner.splitSummary).toBe("Equal among 2");
    expect(dinner.items).toBeUndefined();
  });

  it("computes per-person paid/owed/net and contributions, netting to zero", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    const ann = r.perPerson!.find((p) => p.name === "Ann")!;
    expect(ann).toMatchObject({ paidCents: 2000, owedCents: 1600, netCents: 400 });
    expect(ann.contributions).toEqual([
      { description: "Dinner", owedCents: 1000 },
      { description: "Snacks", owedCents: 600 },
    ]);
    const sum = r.perPerson!.reduce((acc, p) => acc + p.netCents, 0);
    expect(sum).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/export/report.test.ts`
Expected: FAIL — `buildReport` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/export/report.ts`:

```ts
import type { Expense, Group, ID } from "../types";
import {
  computeBalances,
  computeExpenseShares,
  payerCredit,
  expenseTotalCents,
} from "../engine/balances";
import { settle } from "../engine/settle";

export interface ReportSections {
  settleUp: boolean;
  expenses: boolean;
  perPerson: boolean;
}

export interface ReportData {
  header: { groupName: string; generatedDate: string };
  settleUp?: {
    netBalances: { name: string; cents: number }[];
    transfers: { from: string; to: string; cents: number }[];
  };
  expenses?: {
    description: string;
    date: string;
    payerName: string;
    amountCents: number;
    splitSummary: string;
    items?: { name: string; cents: number; assigneeNames: string[] }[];
  }[];
  perPerson?: {
    name: string;
    paidCents: number;
    owedCents: number;
    netCents: number;
    contributions: { description: string; owedCents: number }[];
  }[];
}

function splitSummary(expense: Expense): string {
  if (Array.isArray(expense.items) && expense.items.length > 0) return "Itemised";
  switch (expense.splitType) {
    case "equal":
      return `Equal among ${expense.members.length}`;
    case "exact":
      return "Exact amounts";
    case "percent":
      return "Percentage";
    case "shares":
      return "Shares";
  }
}

export function buildReport(
  group: Group,
  opts: { sections: ReportSections; generatedDate: string },
): ReportData {
  const nameOf = new Map<ID, string>(group.people.map((p) => [p.id, p.name]));
  const name = (id: ID): string => nameOf.get(id) ?? "Unknown";

  const data: ReportData = {
    header: { groupName: group.name, generatedDate: opts.generatedDate },
  };

  if (opts.sections.settleUp) {
    const balances = computeBalances(group);
    data.settleUp = {
      netBalances: group.people.map((p) => ({
        name: p.name,
        cents: balances.get(p.id) ?? 0,
      })),
      transfers: settle(balances).map((t) => ({
        from: name(t.fromId),
        to: name(t.toId),
        cents: t.amountCents,
      })),
    };
  }

  if (opts.sections.expenses) {
    data.expenses = group.expenses.map((e) => {
      const itemized = Array.isArray(e.items) && e.items.length > 0;
      return {
        description: e.description,
        date: e.date,
        payerName: name(e.payerId),
        amountCents: expenseTotalCents(e),
        splitSummary: splitSummary(e),
        items: itemized
          ? e.items!.map((it) => ({
              name: it.name,
              cents: it.amountCents,
              assigneeNames: it.assigneeIds.map(name),
            }))
          : undefined,
      };
    });
  }

  if (opts.sections.perPerson) {
    data.perPerson = group.people.map((p) => {
      let paidCents = 0;
      let owedCents = 0;
      const contributions: { description: string; owedCents: number }[] = [];
      for (const e of group.expenses) {
        if (e.payerId === p.id) paidCents += payerCredit(e);
        const share = computeExpenseShares(e).get(p.id) ?? 0;
        if (share !== 0) {
          owedCents += share;
          contributions.push({ description: e.description, owedCents: share });
        }
      }
      return {
        name: p.name,
        paidCents,
        owedCents,
        netCents: paidCents - owedCents,
        contributions,
      };
    });
  }

  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/export/report.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/export/report.ts src/export/report.test.ts
git commit -m "Add pure report builder for PDF export"
```

---

### Task 2: PDF document component (`ReconcilePdf.tsx`)

**Files:**
- Modify: `package.json` (add `@react-pdf/renderer` dependency)
- Create: `src/export/ReconcilePdf.tsx`
- Test: `src/export/ReconcilePdf.test.tsx`

**Interfaces:**
- Consumes: `ReportData` from `./report`; `formatCents` from `../engine/money`; `@react-pdf/renderer` (`Document`, `Page`, `View`, `Text`, `StyleSheet`, `renderToBuffer`).
- Produces: `function ReconcilePdf(props: { data: ReportData }): JSX.Element` (a `<Document>`).

- [ ] **Step 1: Install the dependency**

Run: `npm install @react-pdf/renderer`
Expected: `@react-pdf/renderer` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `src/export/ReconcilePdf.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReconcilePdf } from "./ReconcilePdf";
import type { ReportData } from "./report";

const sample: ReportData = {
  header: { groupName: "Trip", generatedDate: "2026-06-23" },
  settleUp: {
    netBalances: [
      { name: "Ann", cents: 400 },
      { name: "Bob", cents: -400 },
    ],
    transfers: [{ from: "Bob", to: "Ann", cents: 400 }],
  },
  expenses: [
    {
      description: "Snacks",
      date: "2026-06-21",
      payerName: "Bob",
      amountCents: 1000,
      splitSummary: "Itemised",
      items: [
        { name: "Chips", cents: 600, assigneeNames: ["Ann"] },
        { name: "Soda", cents: 400, assigneeNames: [] },
      ],
    },
  ],
  perPerson: [
    {
      name: "Ann",
      paidCents: 2000,
      owedCents: 1600,
      netCents: 400,
      contributions: [{ description: "Dinner", owedCents: 1000 }],
    },
  ],
};

describe("ReconcilePdf", () => {
  it("renders a representative report to a non-empty PDF buffer", async () => {
    const buffer = await renderToBuffer(<ReconcilePdf data={sample} />);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("renders when optional sections are omitted", async () => {
    const buffer = await renderToBuffer(
      <ReconcilePdf data={{ header: sample.header }} />,
    );
    expect(buffer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/export/ReconcilePdf.test.tsx`
Expected: FAIL — `ReconcilePdf` is not defined / module not found.

- [ ] **Step 4: Write minimal implementation**

Create `src/export/ReconcilePdf.tsx`:

```tsx
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReportData } from "./report";
import { formatCents } from "../engine/money";

const money = (cents: number): string => `$${formatCents(cents)}`;

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  title: { fontSize: 20, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#666", marginBottom: 16 },
  section: { marginBottom: 18 },
  heading: {
    fontSize: 13,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 3,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1, paddingLeft: 12 },
  muted: { color: "#777" },
  bold: { fontFamily: "Helvetica-Bold" },
  expenseBlock: { marginBottom: 8 },
});

export function ReconcilePdf({ data }: { data: ReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.header.groupName}</Text>
        <Text style={styles.subtitle}>
          Generated {data.header.generatedDate}
        </Text>

        {data.settleUp && (
          <View style={styles.section}>
            <Text style={styles.heading}>Settle up</Text>
            {data.settleUp.transfers.length === 0 ? (
              <Text style={styles.muted}>All settled up.</Text>
            ) : (
              data.settleUp.transfers.map((t, i) => (
                <View style={styles.row} key={`t${i}`}>
                  <Text>
                    {t.from} pays {t.to}
                  </Text>
                  <Text>{money(t.cents)}</Text>
                </View>
              ))
            )}
            <View style={{ marginTop: 6 }}>
              {data.settleUp.netBalances.map((b, i) => (
                <View style={styles.row} key={`b${i}`}>
                  <Text style={styles.muted}>{b.name}</Text>
                  <Text style={styles.muted}>{money(b.cents)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.expenses && (
          <View style={styles.section}>
            <Text style={styles.heading}>Expenses</Text>
            {data.expenses.map((e, i) => (
              <View style={styles.expenseBlock} key={`e${i}`}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{e.description}</Text>
                  <Text style={styles.bold}>{money(e.amountCents)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>
                    {e.date} · paid by {e.payerName} · {e.splitSummary}
                  </Text>
                </View>
                {e.items?.map((it, j) => (
                  <View style={styles.itemRow} key={`e${i}i${j}`}>
                    <Text style={styles.muted}>
                      {it.name}
                      {it.assigneeNames.length > 0
                        ? ` (${it.assigneeNames.join(", ")})`
                        : " (pending)"}
                    </Text>
                    <Text style={styles.muted}>{money(it.cents)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {data.perPerson && (
          <View style={styles.section}>
            <Text style={styles.heading}>Per person</Text>
            {data.perPerson.map((p, i) => (
              <View style={styles.expenseBlock} key={`p${i}`}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{p.name}</Text>
                  <Text style={styles.bold}>net {money(p.netCents)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>
                    paid {money(p.paidCents)} · owed {money(p.owedCents)}
                  </Text>
                </View>
                {p.contributions.map((c, j) => (
                  <View style={styles.itemRow} key={`p${i}c${j}`}>
                    <Text style={styles.muted}>{c.description}</Text>
                    <Text style={styles.muted}>{money(c.owedCents)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/export/ReconcilePdf.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add package.json package-lock.json src/export/ReconcilePdf.tsx src/export/ReconcilePdf.test.tsx
git commit -m "Add react-pdf document component for reconciliation export"
```

---

### Task 3: Export modal + header entry point

**Files:**
- Create: `src/components/ExportModal.tsx`
- Modify: `src/App.tsx` (add Export PDF button + modal state)

**Interfaces:**
- Consumes: `useApp()` from `../state/AppContext` (`activeGroup`); lazy `import("../export/report")` (`buildReport`, `ReportSections`), `import("../export/ReconcilePdf")` (`ReconcilePdf`), `import("@react-pdf/renderer")` (`pdf`); type `Group` from `../types`.
- Produces: `function ExportModal(props: { group: Group; onClose: () => void }): JSX.Element`.

No automated test — the codebase has no component test harness (only engine/reducer/theme units). Verify via typecheck, lint, build, and manual check.

- [ ] **Step 1: Create the modal component**

Create `src/components/ExportModal.tsx`:

```tsx
import { useState } from "react";
import type { Group } from "../types";
import type { ReportSections } from "../export/report";

const SECTION_LABELS: { key: keyof ReportSections; label: string }[] = [
  { key: "settleUp", label: "Settle-up summary" },
  { key: "expenses", label: "Expense list" },
  { key: "perPerson", label: "Per-person breakdown" },
];

export default function ExportModal({
  group,
  onClose,
}: {
  group: Group;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<ReportSections>({
    settleUp: true,
    expenses: true,
    perPerson: true,
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noneSelected =
    !sections.settleUp && !sections.expenses && !sections.perPerson;

  function toggle(key: keyof ReportSections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleDownload() {
    setGenerating(true);
    setError(null);
    try {
      const [{ buildReport }, { ReconcilePdf }, { pdf }] = await Promise.all([
        import("../export/report"),
        import("../export/ReconcilePdf"),
        import("@react-pdf/renderer"),
      ]);
      const generatedDate = new Date().toISOString().slice(0, 10);
      const data = buildReport(group, { sections, generatedDate });
      const blob = await pdf(<ReconcilePdf data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reconcile - ${group.name} - ${generatedDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Could not generate the PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export PDF"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-fg">Export PDF</h2>
        <p className="mt-1 text-sm text-muted">
          Choose which sections to include.
        </p>

        <div className="mt-4 space-y-2">
          {SECTION_LABELS.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg"
            >
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={noneSelected || generating}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the Export PDF button into the header**

In `src/App.tsx`: add imports at the top alongside the others:

```tsx
import { useState } from "react";
import ExportModal from "./components/ExportModal";
```

Replace the `Workspace` function's body so the header carries an Export button and the modal renders when open. The header `<div>` currently holds only `<ThemeToggle />`; change it to:

```tsx
function Workspace() {
  const { activeGroup } = useApp();
  const [exportOpen, setExportOpen] = useState(false);

  const canExport = !!activeGroup && activeGroup.people.length > 0;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Reconcile
            </h1>
            <p className="mt-1 text-sm text-muted">
              Track shared expenses and settle up with the fewest payments.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={!canExport}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export PDF
            </button>
            <ThemeToggle />
          </div>
        </header>

        <div className="mt-8">
          <GroupSwitcher />
        </div>

        {activeGroup ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <PeopleManager />
              <ExpenseForm />
              <ExpenseList />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <BalancesPanel />
              <SettlePanel />
            </div>
          </div>
        ) : null}
      </div>

      {exportOpen && activeGroup && (
        <ExportModal group={activeGroup} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 4: Build to confirm lazy chunking**

Run: `npm run build`
Expected: build succeeds; Vite output shows a separate dynamically-imported chunk for the react-pdf code (not folded into the main entry chunk).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, then in the browser:
1. With an active group that has people and expenses, click **Export PDF**.
2. Untick a section, confirm Download stays enabled; untick all three, confirm Download disables.
3. Click **Download**, confirm a `Reconcile - <group> - <date>.pdf` file downloads and its contents match the selected sections (title block, settle-up, expenses with itemised lines, per-person).
4. Confirm the **Export PDF** header button is disabled when no group is active or the group has no people.

- [ ] **Step 6: Commit**

```bash
git add src/components/ExportModal.tsx src/App.tsx
git commit -m "Add export modal and header entry point for PDF export"
```

---

## Self-Review

- **Spec coverage:** settle-up/expense/per-person sections (Task 1 `ReportData` + Task 2 rendering); section toggles (Task 1 `ReportSections`, Task 3 modal); title block group name + date (Task 1 `header`, Task 2 title); `@react-pdf/renderer` direct download (Task 3); lazy loading (Task 3 dynamic `import()`, verified in Task 2/3 build); header entry point disabled when nothing to export (Task 3); tests for builder + render smoke (Tasks 1–2); no engine/state changes (all tasks additive). All spec sections map to a task.
- **Types:** `ReportData`, `ReportSections`, `buildReport(group, { sections, generatedDate })`, and `ReconcilePdf({ data })` are consistent across Tasks 1–3. `Transfer` fields (`fromId`, `toId`, `amountCents`) match `src/types.ts`.
- **Placeholders:** none — every code and test step is concrete.
