import { useMemo, useState } from "react";
import type { Expense, SplitMember } from "../types";
import { useApp } from "../state/AppContext";
import { parseAmountToCents } from "../engine/money";
import { newId } from "../lib/id";
import SplitEditor, { isSplitValid, type SplitEditorValue } from "./SplitEditor";

interface ExpenseFormProps {
  editingExpense?: Expense;
  onDone?: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({ editingExpense, onDone }: ExpenseFormProps) {
  const { dispatch, activeGroup } = useApp();
  const people = activeGroup?.people ?? [];
  const isEditing = Boolean(editingExpense);

  const [description, setDescription] = useState(
    editingExpense?.description ?? "",
  );
  const [amountInput, setAmountInput] = useState(() =>
    editingExpense
      ? (editingExpense.amountCents / 100).toFixed(2)
      : "",
  );
  const [payerId, setPayerId] = useState(
    editingExpense?.payerId ?? people[0]?.id ?? "",
  );
  const [date, setDate] = useState(editingExpense?.date ?? today());
  const [split, setSplit] = useState<SplitEditorValue>(() => {
    if (editingExpense) {
      return {
        splitType: editingExpense.splitType,
        members: editingExpense.members.map((m) => ({ ...m })),
      };
    }
    return {
      splitType: "equal",
      members: people.map((p): SplitMember => ({ personId: p.id, value: 0 })),
    };
  });

  const amountCents = useMemo(
    () => parseAmountToCents(amountInput),
    [amountInput],
  );
  const amountInvalid = amountInput.trim() !== "" && amountCents === null;

  const splitValid =
    amountCents !== null &&
    isSplitValid(amountCents, split.splitType, split.members);

  const canSubmit =
    people.length > 0 &&
    description.trim() !== "" &&
    amountCents !== null &&
    amountCents > 0 &&
    Boolean(payerId) &&
    split.members.length > 0 &&
    splitValid;

  function resetForAdd() {
    setDescription("");
    setAmountInput("");
    setPayerId(people[0]?.id ?? "");
    setDate(today());
    setSplit({
      splitType: "equal",
      members: people.map((p): SplitMember => ({ personId: p.id, value: 0 })),
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || amountCents === null || !activeGroup) return;

    const expense: Expense = {
      id: editingExpense?.id ?? newId(),
      description: description.trim(),
      amountCents,
      payerId,
      date,
      splitType: split.splitType,
      members: split.members.map((m) => ({ ...m })),
    };

    if (isEditing) {
      dispatch({ type: "UPDATE_EXPENSE", groupId: activeGroup.id, expense });
      onDone?.();
    } else {
      dispatch({ type: "ADD_EXPENSE", groupId: activeGroup.id, expense });
      resetForAdd();
    }
  }

  if (!activeGroup) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Create or select a group to add expenses.
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Add people to this group before recording an expense.
      </div>
    );
  }

  // Defend against a stale payer if people changed underneath us.
  const effectivePayerId =
    people.some((p) => p.id === payerId) ? payerId : people[0]?.id ?? "";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-base font-semibold text-slate-900">
        {isEditing ? "Edit expense" : "Add an expense"}
      </h3>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner, groceries, taxi…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Amount
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            aria-invalid={amountInvalid}
            className={
              "w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 " +
              (amountInvalid
                ? "border-rose-400 focus:border-rose-400 focus:ring-rose-400"
                : "border-slate-300 focus:border-slate-400 focus:ring-slate-400")
            }
          />
          {amountInvalid && (
            <p className="text-xs text-rose-600">Enter a valid amount.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Paid by
          </label>
          <select
            value={effectivePayerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Split between
        </label>
        <SplitEditor
          amountCents={amountCents ?? 0}
          people={people}
          value={split}
          onChange={setSplit}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className={
            "rounded-md px-4 py-2 text-sm font-medium text-white transition " +
            (canSubmit
              ? "bg-slate-900 hover:bg-slate-800"
              : "cursor-not-allowed bg-slate-300")
          }
        >
          {isEditing ? "Save changes" : "Add expense"}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={() => onDone?.()}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
