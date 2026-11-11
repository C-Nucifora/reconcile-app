import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Expense, Group } from "../types";
import ExpenseForm from "./ExpenseForm";
import ExpenseList from "./ExpenseList";
import SplitEditor from "./SplitEditor";
import ItemsEditor from "./ItemsEditor";

const context = vi.hoisted(() => ({ activeGroup: null as Group | null, dispatch: vi.fn() }));
vi.mock("../state/AppContext", () => ({ useApp: () => context }));
vi.mock("./ReceiptUpload", () => ({ default: () => null }));

const people = [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }];
const expense: Expense = {
  id: "fictional-dinner", description: "Fictional dinner", amountCents: 2500,
  payerId: "alex", date: "2026-01-01", splitType: "equal",
  members: people.map((person) => ({ personId: person.id, value: 0 })),
};

beforeEach(() => {
  context.activeGroup = { id: "fictional-trip", name: "Fictional trip", people, expenses: [] };
  context.dispatch.mockClear();
});

describe("expense editor rendering", () => {
  it("defaults to current people and labels every primary field", () => {
    const html = renderToStaticMarkup(<ExpenseForm />);
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2);
    for (const label of ["Description", "Amount", "Paid by", "Date"]) {
      expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${label}</label>`));
    }
    expect(html).toContain('<option value="alex" selected="">Alex</option>');
    expect(html).toContain('aria-label="Itemize expense"');
    expect(html).toContain('aria-label="Add an expense"');
    expect(context.dispatch).not.toHaveBeenCalled();
  });

  it("uses the displayed payer and removes obsolete participants from an edit", () => {
    context.activeGroup!.people = [people[1]];
    const html = renderToStaticMarkup(<ExpenseForm editingExpense={expense} />);
    expect(html).toContain('<option value="sam" selected="">Sam</option>');
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).toContain("Re-check the assignments below before saving.");
    expect(html).not.toMatch(/disabled=""[^>]*>Save changes/);
  });

  it("counts other expenses when guarding group totals and excludes the edited expense", () => {
    const maximum = { ...expense, amountCents: Number.MAX_SAFE_INTEGER };
    context.activeGroup!.expenses = [maximum];
    const edit = renderToStaticMarkup(<ExpenseForm editingExpense={maximum} />);
    expect(edit).toContain('value="90071992547409.91"');
    expect(edit).not.toContain("group total too large");
    const extra = renderToStaticMarkup(<ExpenseForm editingExpense={{ ...expense, id: "new-expense" }} />);
    expect(extra).toContain("group total too large");
    expect(extra).toMatch(/disabled=""[^>]*>Save changes/);
  });

  it("names repeated expense actions using their descriptions", () => {
    context.activeGroup!.expenses = [expense, { ...expense, id: "taxi", description: "Fictional taxi" }];
    const html = renderToStaticMarkup(<ExpenseList />);
    for (const description of ["Fictional dinner", "Fictional taxi"]) {
      expect(html).toContain(`aria-label="Edit ${description}"`);
      expect(html).toContain(`aria-label="Delete ${description}"`);
    }
    expect(html).toContain('aria-label="Expenses"');
  });

  it("keeps an oversized edit visible and explains why it cannot submit", () => {
    const description = "x".repeat(10_001);
    const html = renderToStaticMarkup(<ExpenseForm editingExpense={{ ...expense, description }} />);
    expect(html).toContain(`value="${description}"`);
    expect(html).toContain('maxLength="10000"');
    expect(html).toContain("Your draft is still here.");
    expect(html).toMatch(/disabled=""[^>]*>Save changes/);
    expect(context.dispatch).not.toHaveBeenCalled();
  });

  it("marks invalid shares and connects split inputs to recovery guidance", () => {
    const html = renderToStaticMarkup(<SplitEditor amountCents={2500} people={people}
      value={{ splitType: "shares", members: [{ personId: "alex", value: 0.5 }] }} onChange={vi.fn()} />);
    expect(html).toMatch(/aria-label="Shares for Alex" aria-invalid="true" aria-describedby="[^"]+"/);
    expect(html).toContain("positive whole number");
    expect(html).toContain('role="status"');
  });

  it("distinguishes item controls and explains incomplete rows", () => {
    const html = renderToStaticMarkup(<ItemsEditor people={people} onChange={vi.fn()} items={[
      { id: "snack", name: "Fictional snack", priceInput: "", assigneeIds: [] },
      { id: "drink", name: "", priceInput: "1.00", assigneeIds: ["sam"] },
    ]} />);
    expect(html).toContain('aria-label="Item 1 price" aria-invalid="true"');
    expect(html).toContain('aria-label="Item 2 name" aria-invalid="true"');
    expect(html).toContain('aria-label="Remove item 2"');
    expect(html).toContain('aria-label="Assign Sam to item 2"');
    expect(html).toContain("Enter an item name and a valid price greater than zero.");
  });
});
