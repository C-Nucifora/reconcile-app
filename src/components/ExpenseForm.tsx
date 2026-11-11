import { useId, useMemo, useRef, useState } from "react";
import type { Expense, ExpenseItem, ID, SplitMember } from "../types";
import { useApp } from "../state/AppContext";
import { formatCents, parseAmountToCents } from "../engine/money";
import { newId } from "../lib/id";
import SplitEditor, { type SplitEditorValue } from "./SplitEditor";
import ItemsEditor from "./ItemsEditor";
import {
  isSplitValid,
  areItemsValid,
  emptyItemDraft,
  itemCents,
  type ItemDraft,
} from "./expenseValidation";
import ReceiptUpload from "./ReceiptUpload";
import { MAX_TEXT_LENGTH } from "../state/storage";

interface ExpenseFormProps {
  editingExpense?: Expense;
  onDone?: () => void;
}

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

// Seed the itemized editor from an existing expense, dropping assignees that
// reference people no longer in the group.
function draftsFromExpense(
  expense: Expense | undefined,
  peopleIds: Set<ID>,
): ItemDraft[] {
  if (!expense?.items || expense.items.length === 0) {
    return [emptyItemDraft()];
  }
  return expense.items.map((item) => ({
    id: item.id,
    name: item.name,
    priceInput: formatCents(item.amountCents),
    assigneeIds: item.assigneeIds.filter((id) => peopleIds.has(id)),
  }));
}

export default function ExpenseForm({ editingExpense, onDone }: ExpenseFormProps) {
  const { dispatch, activeGroup } = useApp();
  const formId = useId();
  const people = useMemo(() => activeGroup?.people ?? [], [activeGroup?.people]);
  const submitted = useRef(false);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(editingExpense);

  const peopleIds = useMemo(
    () => new Set(people.map((p) => p.id)),
    [people],
  );

  const [description, setDescription] = useState(
    editingExpense?.description ?? "",
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receiptDraft, setReceiptDraft] = useState(0);
  const [amountInput, setAmountInput] = useState(() =>
    editingExpense && (!editingExpense.items || editingExpense.items.length === 0)
      ? formatCents(editingExpense.amountCents)
      : "",
  );
  const [payerId, setPayerId] = useState(
    editingExpense?.payerId ?? people[0]?.id ?? "",
  );
  const [date, setDate] = useState(editingExpense?.date ?? today());

  const [itemized, setItemized] = useState(
    Boolean(editingExpense?.items && editingExpense.items.length > 0),
  );

  const [receiptImageId, setReceiptImageId] = useState<ID | undefined>(
    editingExpense?.receiptImageId,
  );

  const [split, setSplit] = useState<SplitEditorValue | null>(() => {
    if (editingExpense && editingExpense.members.length > 0) {
      // Drop members referencing a person who has since been removed; an
      // orphaned member is invisible in the editor but would otherwise be
      // re-validated and persisted on save.
      return {
        splitType: editingExpense.splitType,
        members: editingExpense.members
          .filter((m) => peopleIds.has(m.personId))
          .map((m) => ({ ...m })),
      };
    }
    return null;
  });

  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>(() =>
    draftsFromExpense(editingExpense, peopleIds),
  );

  // Whether the expense being edited referenced people no longer in the group
  // (in either its split members or its item assignees).
  const hadOrphanRefs = useMemo(() => {
    if (!editingExpense) return false;
    const memberOrphan = editingExpense.members.some(
      (m) => !peopleIds.has(m.personId),
    );
    const itemOrphan = (editingExpense.items ?? []).some((item) =>
      item.assigneeIds.some((id) => !peopleIds.has(id)),
    );
    return memberOrphan || itemOrphan;
  }, [editingExpense, peopleIds]);

  const amountCents = useMemo(
    () => parseAmountToCents(amountInput),
    [amountInput],
  );
  const amountInvalid =
    !itemized && amountInput.trim() !== "" && amountCents === null;

  // Total for itemized mode = sum of all parseable, positive item prices.
  const itemsTotalCents = useMemo(() => {
    let total = 0;
    for (const item of itemDrafts) {
      const cents = itemCents(item);
      if (cents !== null && cents > 0) total += cents;
    }
    return total;
  }, [itemDrafts]);

  const draftSplit = split ?? {
    splitType: "equal" as const,
    members: people.map((p): SplitMember => ({ personId: p.id, value: 0 })),
  };
  const currentMembers = draftSplit.members.filter((m) => peopleIds.has(m.personId));
  const currentSplit = { ...draftSplit, members: currentMembers };
  const currentItemDrafts = itemDrafts.map((item) => ({
    ...item, assigneeIds: item.assigneeIds.filter((id) => peopleIds.has(id)),
  }));

  const splitValid =
    amountCents !== null &&
    isSplitValid(amountCents, currentSplit.splitType, currentMembers);

  const itemsValid = useMemo(
    () => areItemsValid(itemDrafts),
    [itemDrafts],
  );

  // Use the same payer for display and submission after people change.
  const effectivePayerId = peopleIds.has(payerId) ? payerId : people[0]?.id ?? "";

  const otherExpensesTotal = (activeGroup?.expenses ?? [])
    .filter((expense) => expense.id !== editingExpense?.id)
    .reduce((total, expense) => total + expense.amountCents, 0);
  const proposedTotal = otherExpensesTotal + (itemized ? itemsTotalCents : amountCents ?? 0);
  const totalTooLarge = !Number.isSafeInteger(proposedTotal);
  const textTooLong = description.trim().length > MAX_TEXT_LENGTH ||
    (itemized && itemDrafts.some((item) => item.name.trim().length > MAX_TEXT_LENGTH));

  const canSubmit =
    !totalTooLarge &&
    !textTooLong &&
    people.length > 0 &&
    description.trim() !== "" &&
    Boolean(effectivePayerId) &&
    date.trim() !== "" &&
    (itemized
      ? itemsValid && Number.isSafeInteger(itemsTotalCents) && itemsTotalCents > 0
      : amountCents !== null &&
        amountCents > 0 &&
        currentMembers.length > 0 &&
        splitValid);

  function resetForAdd() {
    setSubmitError(null);
    setReceiptDraft((value) => value + 1);
    setDescription("");
    setAmountInput("");
    setPayerId(people[0]?.id ?? "");
    setDate(today());
    setItemized(false);
    setReceiptImageId(undefined);
    setSplit(null);
    setItemDrafts([emptyItemDraft()]);
  }

  // Build the line items for an itemized expense from the current drafts,
  // keeping only rows that have a name and a positive price.
  function buildItems(): ExpenseItem[] {
    const items: ExpenseItem[] = [];
    for (const draft of itemDrafts) {
      const name = draft.name.trim();
      const cents = itemCents(draft);
      if (name === "" || cents === null || cents <= 0) continue;
      items.push({
        id: draft.id,
        name,
        amountCents: cents,
        // Defensive: never persist an assignee for someone outside the group.
        assigneeIds: draft.assigneeIds.filter((id) => peopleIds.has(id)),
      });
    }
    return items;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !activeGroup || submitted.current) return;

    let expense: Expense;
    if (itemized) {
      const items = buildItems();
      if (items.length === 0) return;
      const total = items.reduce((acc, it) => acc + it.amountCents, 0);
      expense = {
        id: editingExpense?.id ?? newId(),
        description: description.trim(),
        amountCents: total,
        payerId: effectivePayerId,
        date,
        splitType: "equal",
        members: [],
        items,
        ...(receiptImageId ? { receiptImageId } : {}),
      };
    } else {
      if (amountCents === null) return;
      expense = {
        id: editingExpense?.id ?? newId(),
        description: description.trim(),
        amountCents,
        payerId: effectivePayerId,
        date,
        splitType: currentSplit.splitType,
        members: currentMembers.map((m) => ({ ...m })),
        ...(receiptImageId ? { receiptImageId } : {}),
      };
    }

    submitted.current = true;
    const accepted = dispatch({ type: isEditing ? "UPDATE_EXPENSE" : "ADD_EXPENSE", groupId: activeGroup.id, expense });
    if (!accepted) {
      submitted.current = false;
      setSubmitError("The expense could not be accepted. Your draft is still here. Check its values and text lengths before retrying.");
      return;
    }
    if (isEditing) {
      onDone?.();
    } else {
      resetForAdd();
      descriptionRef.current?.focus();
    }
  }

  if (!activeGroup) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted shadow-sm">
        Create or select a group to add expenses.
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted shadow-sm">
        Add people to this group before recording an expense.
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";
  const labelClass =
    "block text-xs font-medium uppercase tracking-wide text-muted";

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => { submitted.current = false; setSubmitError(null); }}
      aria-label={isEditing ? "Edit expense" : "Add an expense"}
      className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-fg">
          {isEditing ? "Edit expense" : "Add an expense"}
        </h3>

        <div className="flex flex-col items-end gap-1">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
            <span>Itemize</span>
            <button
              type="button"
              role="switch"
              aria-label="Itemize expense"
              aria-checked={itemized}
              onClick={() => setItemized((v) => !v)}
              className={
                "relative inline-flex h-5 w-9 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
                (itemized ? "bg-accent" : "bg-surface-2 border border-line")
              }
            >
              <span
                className={
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-surface shadow-sm transition " +
                  (itemized ? "translate-x-4" : "translate-x-1")
                }
              />
            </button>
          </label>
          <p className="text-right text-xs text-muted">
            Switching keeps your entries; only the active mode is saved.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${formId}-description`} className={labelClass}>Description</label>
        <input
          type="text"
          id={`${formId}-description`}
          maxLength={MAX_TEXT_LENGTH}
          ref={descriptionRef}
          autoFocus={isEditing}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner, groceries, taxi…"
          className={inputClass}
        />
      </div>

      <div
        className={
          "grid grid-cols-1 gap-4 " +
          (itemized ? "sm:grid-cols-2" : "sm:grid-cols-3")
        }
      >
        {!itemized && (
          <div className="space-y-1">
            <label htmlFor={`${formId}-amount`} className={labelClass}>Amount</label>
            <input
              type="text"
              id={`${formId}-amount`}
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
              aria-invalid={amountInvalid}
              aria-describedby={amountInvalid ? `${formId}-amount-error` : undefined}
              className={
                "w-full rounded-lg border bg-surface px-3 py-2 text-sm tabular-nums text-fg placeholder:text-muted focus:outline-none focus:ring-2 " +
                (amountInvalid
                  ? "border-negative focus:ring-negative"
                  : "border-line focus:ring-accent")
              }
            />
            {amountInvalid && (
              <p id={`${formId}-amount-error`} className="text-xs text-negative">Enter a valid amount.</p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor={`${formId}-payer`} className={labelClass}>Paid by</label>
          <select
            id={`${formId}-payer`}
            value={effectivePayerId}
            onChange={(e) => setPayerId(e.target.value)}
            className={inputClass}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-date`} className={labelClass}>Date</label>
          <input
            type="date"
            id={`${formId}-date`}
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            onBlur={(e) => {
              // A native date input can be cleared to ""; fall back to today so
              // list ordering and rendered metadata never show a blank date.
              if (e.target.value.trim() === "") setDate(today());
            }}
            className={inputClass}
          />
        </div>
      </div>

      {hadOrphanRefs && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          A person who was previously included in this expense has been removed
          from the group. Re-check the assignments below before saving.
        </p>
      )}

      {itemized ? (
        <div className="space-y-2">
          <p className={labelClass}>Items</p>
          <ItemsEditor
            people={people}
            items={currentItemDrafts}
            onChange={setItemDrafts}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className={labelClass}>Split between</p>
          <SplitEditor
            amountCents={amountCents ?? 0}
            people={people}
            value={currentSplit}
            onChange={setSplit}
          />
        </div>
      )}

      <ReceiptUpload key={receiptDraft} imageId={receiptImageId} onChange={setReceiptImageId} />

      {(textTooLong || submitError) && (
        <p role="alert" className="text-sm text-negative">
          {textTooLong ? `Descriptions and item names must be at most ${MAX_TEXT_LENGTH.toLocaleString()} characters. Your draft is still here.` : submitError}
        </p>
      )}

      {totalTooLarge && (
        <p role="alert" className="text-sm text-negative">
          This expense would make the group total too large. Reduce the amount.
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className={
            "rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
            (canSubmit
              ? "bg-accent text-accent-fg hover:opacity-90"
              : "cursor-not-allowed bg-surface-2 text-muted")
          }
        >
          {isEditing ? "Save changes" : "Add expense"}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={() => onDone?.()}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-2"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
