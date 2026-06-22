import { useMemo } from "react";
import type { ID, Person } from "../types";
import { formatCents, parseAmountToCents, splitCents } from "../engine/money";
import { newId } from "../lib/id";

// A single editable row. priceInput is the raw text the user types; the parsed
// cents value is derived for totals/validity. assigneeIds split the item
// equally — an empty array means the row is pending (unallocated).
export interface ItemDraft {
  id: ID;
  name: string;
  priceInput: string;
  assigneeIds: ID[];
}

interface ItemsEditorProps {
  people: Person[];
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
}

export function emptyItemDraft(): ItemDraft {
  return { id: newId(), name: "", priceInput: "", assigneeIds: [] };
}

/** Cents for a single draft row, or null when the price is blank/invalid. */
export function itemCents(item: ItemDraft): number | null {
  if (item.priceInput.trim() === "") return null;
  return parseAmountToCents(item.priceInput);
}

/**
 * Whether the set of item drafts is valid to save: at least one row has a
 * non-empty name and a positive, parseable price, and no row carries a
 * name/price that fails to parse. A pending (unassigned) row is allowed.
 */
export function areItemsValid(items: ItemDraft[]): boolean {
  let hasOneGood = false;
  for (const item of items) {
    const name = item.name.trim();
    const priceText = item.priceInput.trim();
    const cents = itemCents(item);

    // A row with text in either field must parse to a positive priced, named
    // line; a fully-blank row is simply ignored.
    const blank = name === "" && priceText === "";
    if (blank) continue;

    if (name === "" || cents === null || cents <= 0) return false;
    hasOneGood = true;
  }
  return hasOneGood;
}

export default function ItemsEditor({
  people,
  items,
  onChange,
}: ItemsEditorProps) {
  const totals = useMemo(() => {
    let total = 0;
    let pending = 0;
    let pendingCount = 0;
    for (const item of items) {
      const cents = itemCents(item);
      if (cents === null || cents <= 0) continue;
      total += cents;
      if (item.assigneeIds.length === 0) {
        pending += cents;
        pendingCount += 1;
      }
    }
    return { total, pending, pendingCount };
  }, [items]);

  function updateRow(id: ID, patch: Partial<ItemDraft>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addRow() {
    onChange([...items, emptyItemDraft()]);
  }

  function removeRow(id: ID) {
    const next = items.filter((it) => it.id !== id);
    onChange(next.length > 0 ? next : [emptyItemDraft()]);
  }

  function toggleAssignee(item: ItemDraft, personId: ID) {
    const has = item.assigneeIds.includes(personId);
    const assigneeIds = has
      ? item.assigneeIds.filter((p) => p !== personId)
      : [...item.assigneeIds, personId];
    updateRow(item.id, { assigneeIds });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((item) => {
          const cents = itemCents(item);
          const valid = cents !== null && cents > 0;
          const priceInvalid = item.priceInput.trim() !== "" && !valid;
          const pending = item.assigneeIds.length === 0;

          // Per-person preview of an equal split for this row.
          const shareParts =
            valid && item.assigneeIds.length > 0
              ? splitCents(
                  cents,
                  item.assigneeIds.map(() => 1),
                )
              : [];
          const shareByPerson = new Map<ID, number>();
          item.assigneeIds.forEach((pid, i) =>
            shareByPerson.set(pid, shareParts[i] ?? 0),
          );

          return (
            <li
              key={item.id}
              className={
                "rounded-lg border p-3 " +
                (pending
                  ? "border-line bg-warning-soft"
                  : "border-line bg-surface")
              }
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateRow(item.id, { name: e.target.value })}
                  placeholder="Item name"
                  aria-label="Item name"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.priceInput}
                    onChange={(e) =>
                      updateRow(item.id, { priceInput: e.target.value })
                    }
                    placeholder="0.00"
                    aria-label="Item price"
                    aria-invalid={priceInvalid}
                    className={
                      "w-24 rounded-lg border bg-surface px-3 py-2 text-right text-sm tabular-nums text-fg placeholder:text-muted focus:outline-none focus:ring-2 " +
                      (priceInvalid
                        ? "border-negative focus:ring-negative"
                        : "border-line focus:ring-accent")
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(item.id)}
                  aria-label="Remove item"
                  title="Remove item"
                  className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-negative"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {people.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {people.map((person) => {
                    const on = item.assigneeIds.includes(person.id);
                    const share = shareByPerson.get(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => toggleAssignee(item, person.id)}
                        aria-pressed={on}
                        className={
                          "rounded-full px-2.5 py-1 text-xs font-medium transition " +
                          (on
                            ? "bg-accent text-accent-fg"
                            : "text-muted hover:bg-surface-2")
                        }
                      >
                        {person.name}
                        {on && share !== undefined && (
                          <span className="ml-1 tabular-nums opacity-80">
                            {formatCents(share)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {pending && (item.name.trim() !== "" || valid) && (
                <p className="mt-2 text-xs font-medium text-warning">
                  Pending — tap people to split this item.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Add item
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <span className="text-muted">
          Total
          <span className="ml-2 font-semibold tabular-nums text-fg">
            ${formatCents(totals.total)}
          </span>
        </span>
        {totals.pending > 0 && (
          <span className="text-warning">
            Pending: ${" "}
            <span className="font-semibold tabular-nums">
              {formatCents(totals.pending)}
            </span>{" "}
            ({totals.pendingCount}{" "}
            {totals.pendingCount === 1 ? "item" : "items"})
          </span>
        )}
      </div>
    </div>
  );
}
