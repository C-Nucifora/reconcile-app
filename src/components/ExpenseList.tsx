import { useMemo, useState } from "react";
import type { Expense, Person } from "../types";
import { useApp } from "../state/AppContext";
import { formatCents } from "../engine/money";
import { expenseTotalCents, pendingCents } from "../engine/balances";
import { deleteImage } from "../lib/imageStore";
import ExpenseForm from "./ExpenseForm";
import ReceiptViewer from "./ReceiptViewer";
import Dialog from "./Dialog";
import Icon from "./Icon";

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
      ? (nameById.get(expense.members[0].personId) ?? "1 person")
      : `${count} people`;
  return `${SPLIT_LABEL[expense.splitType]} · ${who}`;
}

export default function ExpenseList({ onAdd }: { onAdd: () => void }) {
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
      <div className="empty-ledger">
        <Icon name="receipt" size={30} />
        <h3>A fresh start.</h3>
        <p>
          {people.length
            ? "Add the first expense. We'll work out everyone's share."
            : "Add your people below, then record your first expense."}
        </p>
        <button
          className="button-secondary"
          onClick={onAdd}
          disabled={!people.length}
        >
          <Icon name="plus" size={15} /> Add your first expense
        </button>
      </div>
    );
  }

  return (
    <>
      <ul className="expense-ledger">
        {ordered.map((expense) => {
          const payerName = nameById.get(expense.payerId) ?? "Unknown";
          const isEditing = editingId === expense.id;

          const pending = pendingCents(expense);

          return (
            <li key={expense.id} className="expense-row">
              {isEditing && (
                <Dialog
                  title="Edit expense"
                  onClose={() => setEditingId(null)}
                  wide
                >
                  <ExpenseForm
                    editingExpense={expense}
                    onDone={() => setEditingId(null)}
                  />
                </Dialog>
              )}
              <span className="expense-icon">
                <Icon name="receipt" size={19} />
              </span>
              <div className="expense-info">
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
                    pending: ${formatCents(pending)} (
                    {
                      expense.items!.filter((i) => i.assigneeIds.length === 0)
                        .length
                    }
                    )
                  </span>
                )}
              </div>

              <div className="expense-value">
                <p>${formatCents(expenseTotalCents(expense))}</p>
                <div className="expense-actions">
                  <button
                    type="button"
                    onClick={() => setEditingId(expense.id)}
                    aria-label={`Edit ${expense.description}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(expense)}
                    className="text-negative"
                    aria-label={`Delete ${expense.description}`}
                  >
                    Delete
                  </button>
                </div>
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
