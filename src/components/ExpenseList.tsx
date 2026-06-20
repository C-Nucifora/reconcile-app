import { useMemo, useState } from "react";
import type { Expense, Person } from "../types";
import { useApp } from "../state/AppContext";
import { formatCents } from "../engine/money";
import ExpenseForm from "./ExpenseForm";

const SPLIT_LABEL: Record<Expense["splitType"], string> = {
  equal: "split equally",
  exact: "exact amounts",
  percent: "by percent",
  shares: "by shares",
};

function splitSummary(expense: Expense, nameById: Map<string, string>): string {
  const count = expense.members.length;
  const who =
    count === 1
      ? nameById.get(expense.members[0].personId) ?? "1 person"
      : `${count} people`;
  return `${SPLIT_LABEL[expense.splitType]} · ${who}`;
}

export default function ExpenseList() {
  const { activeGroup, dispatch } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);

  const people: Person[] = activeGroup?.people ?? [];

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of people) map.set(p.id, p.name);
    return map;
  }, [people]);

  // Newest first: by date descending, then by insertion order descending.
  const ordered = useMemo(() => {
    const expenses = activeGroup?.expenses ?? [];
    return expenses
      .map((expense, index) => ({ expense, index }))
      .sort((a, b) => {
        if (a.expense.date !== b.expense.date) {
          return a.expense.date < b.expense.date ? 1 : -1;
        }
        return b.index - a.index;
      })
      .map((x) => x.expense);
  }, [activeGroup?.expenses]);

  if (!activeGroup) {
    return null;
  }

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">No expenses yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Add your first expense above to start tracking.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {ordered.map((expense) => {
        const payerName = nameById.get(expense.payerId) ?? "Unknown";
        const isEditing = editingId === expense.id;

        if (isEditing) {
          return (
            <li key={expense.id}>
              <ExpenseForm
                editingExpense={expense}
                onDone={() => setEditingId(null)}
              />
            </li>
          );
        }

        return (
          <li
            key={expense.id}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {expense.description}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {payerName} paid · {expense.date} · {splitSummary(expense, nameById)}
              </p>
            </div>

            <div className="text-right text-sm font-semibold tabular-nums text-slate-900">
              {formatCents(expense.amountCents)}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingId(expense.id)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "DELETE_EXPENSE",
                    groupId: activeGroup.id,
                    expenseId: expense.id,
                  })
                }
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
