import { useMemo, useState } from "react";
import type { Expense, Person } from "../types";
import { useApp } from "../state/AppContext";
import { formatCents } from "../engine/money";
import {
  expenseTotalCents,
  pendingCents,
} from "../engine/balances";
import { deleteImage } from "../lib/imageStore";
import ExpenseForm from "./ExpenseForm";
import ReceiptViewer from "./ReceiptViewer";

const SPLIT_LABEL: Record<Expense["splitType"], string> = {
  equal: "split equally",
  exact: "exact amounts",
  percent: "by percent",
  shares: "by shares",
};

/** An expense is itemized iff it carries a non-empty list of items. */
function isItemized(expense: Expense): boolean {
  return Array.isArray(expense.items) && expense.items.length > 0;
}

function splitSummary(expense: Expense, nameById: Map<string, string>): string {
  if (isItemized(expense)) {
    const count = expense.items!.length;
    return `itemized · ${count} ${count === 1 ? "item" : "items"}`;
  }
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
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);

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

  function handleDelete(expense: Expense) {
    // Best-effort cleanup of the receipt blob; the reducer stays pure, so the
    // IndexedDB side effect lives here. deleteImage never throws.
    if (expense.receiptImageId) {
      void deleteImage(expense.receiptImageId);
    }
    if (viewingReceiptId === expense.id) setViewingReceiptId(null);
    dispatch({
      type: "DELETE_EXPENSE",
      groupId: activeGroup!.id,
      expenseId: expense.id,
    });
  }

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <p className="text-sm font-medium text-fg">No expenses yet</p>
        <p className="mt-1 text-sm text-muted">
          Add your first expense above to start tracking.
        </p>
      </div>
    );
  }

  return (
    <>
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

          const pending = pendingCents(expense);

          return (
            <li
              key={expense.id}
              className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-fg">
                    {expense.description}
                  </p>
                  {expense.receiptImageId && (
                    <button
                      type="button"
                      onClick={() => setViewingReceiptId(expense.id)}
                      aria-label="View receipt"
                      title="View receipt"
                      className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      <PaperclipIcon />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {payerName} paid · {expense.date} ·{" "}
                  {splitSummary(expense, nameById)}
                </p>
                {pending > 0 && (
                  <span className="mt-1.5 inline-flex items-center rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium tabular-nums text-warning">
                    pending: {formatCents(pending)} (
                    {expense.items!.filter((i) => i.assigneeIds.length === 0)
                      .length}
                    )
                  </span>
                )}
              </div>

              <div className="text-right text-sm font-semibold tabular-nums text-fg">
                {formatCents(expenseTotalCents(expense))}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId(expense.id)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(expense)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-negative hover:bg-negative-soft"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {viewingReceiptId &&
        (() => {
          const target = ordered.find((e) => e.id === viewingReceiptId);
          if (!target?.receiptImageId) return null;
          return (
            <ReceiptViewer
              imageId={target.receiptImageId}
              onClose={() => setViewingReceiptId(null)}
            />
          );
        })()}
    </>
  );
}

function PaperclipIcon() {
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
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
