import type { AppState, Expense, ExpenseItem, Group } from "../types";

export const STORAGE_KEY = "reconcile.v1";

export function emptyState(): AppState {
  return { groups: [], activeGroupId: null, schemaVersion: 1 };
}

const SPLIT_TYPES = new Set(["equal", "exact", "percent", "shares"]);

/**
 * Validate and repair a single itemized line item. Returns a cleaned
 * ExpenseItem, or null when it is unusable. assigneeIds referencing unknown
 * people are dropped (an item may legitimately become pending and is kept).
 */
function sanitizeItem(raw: unknown, peopleIds: Set<string>): ExpenseItem | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Partial<ExpenseItem>;

  if (typeof it.id !== "string" || it.id === "") return null;

  const amountCents =
    typeof it.amountCents === "number" && Number.isFinite(it.amountCents)
      ? Math.trunc(it.amountCents)
      : NaN;
  if (!Number.isFinite(amountCents) || amountCents < 0) return null;

  const assigneeIds = Array.isArray(it.assigneeIds)
    ? it.assigneeIds.filter(
        (a): a is string => typeof a === "string" && peopleIds.has(a),
      )
    : [];

  return {
    id: it.id,
    name: typeof it.name === "string" ? it.name : "",
    amountCents,
    assigneeIds,
  };
}

/**
 * Validate and repair an expense loaded from untrusted storage / import.
 * Returns a cleaned Expense, or null when the record is unusable and should be
 * dropped. An expense is valid when it has a non-empty member list OR a
 * non-empty item list. Members must reference the known people of the group; an
 * exact split whose member values do not sum to the total is repaired so the
 * engine's netting invariant holds. Within items, assignees referencing unknown
 * people are stripped (the item may become pending but is kept).
 */
function sanitizeExpense(raw: unknown, peopleIds: Set<string>): Expense | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Expense>;

  if (typeof e.id !== "string" || e.id === "") return null;
  if (typeof e.payerId !== "string" || !peopleIds.has(e.payerId)) return null;
  if (typeof e.splitType !== "string" || !SPLIT_TYPES.has(e.splitType)) {
    return null;
  }

  const amountCents =
    typeof e.amountCents === "number" && Number.isFinite(e.amountCents)
      ? Math.trunc(e.amountCents)
      : NaN;
  if (!Number.isFinite(amountCents) || amountCents < 0) return null;

  // Sanitize itemized line items, if any. An item that loses all assignees
  // becomes pending but is kept; the item list is what makes this an itemized
  // expense.
  const items = Array.isArray(e.items)
    ? e.items
        .map((it) => sanitizeItem(it, peopleIds))
        .filter((it): it is ExpenseItem => it !== null)
    : [];

  // Keep only members that reference a known person and carry a finite value.
  const members = Array.isArray(e.members)
    ? e.members
        .filter(
          (m): m is { personId: string; value: number } =>
            !!m &&
            typeof m === "object" &&
            typeof (m as { personId?: unknown }).personId === "string" &&
            peopleIds.has((m as { personId: string }).personId) &&
            typeof (m as { value?: unknown }).value === "number" &&
            Number.isFinite((m as { value: number }).value),
        )
        .map((m) => ({ personId: m.personId, value: m.value }))
    : [];

  const isItemized = items.length > 0;

  // An expense needs at least one valid item (itemized) or one valid member
  // (non-itemized) to be reconcilable; otherwise drop it.
  if (!isItemized && members.length === 0) return null;

  // Repair a non-itemized exact split whose values do not sum to amountCents by
  // scaling the last member so the parts add up (the engine also reconciles,
  // but keeping stored data consistent avoids surprising round-trips).
  if (!isItemized && e.splitType === "exact") {
    const sum = members.reduce((acc, m) => acc + Math.trunc(m.value), 0);
    const diff = amountCents - sum;
    if (diff !== 0) {
      const last = members[members.length - 1];
      last.value = Math.max(0, Math.trunc(last.value) + diff);
    }
  }

  const expense: Expense = {
    id: e.id,
    description: typeof e.description === "string" ? e.description : "",
    amountCents,
    payerId: e.payerId,
    date: typeof e.date === "string" && e.date !== "" ? e.date : todayISO(),
    // Itemized expenses ignore members/splitType; normalize to keep stored
    // data consistent with the contract.
    splitType: isItemized ? "equal" : e.splitType,
    members: isItemized ? [] : members,
  };

  if (isItemized) {
    expense.items = items;
  }
  // Keep a receipt reference only when it is a string; the blob may or may not
  // exist and is handled gracefully at display time.
  if (typeof e.receiptImageId === "string") {
    expense.receiptImageId = e.receiptImageId;
  }

  return expense;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeGroup(raw: unknown): Group | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<Group>;
  if (typeof g.id !== "string" || g.id === "") return null;

  const people = Array.isArray(g.people)
    ? g.people.filter(
        (p): p is { id: string; name: string } =>
          !!p &&
          typeof p === "object" &&
          typeof (p as { id?: unknown }).id === "string" &&
          typeof (p as { name?: unknown }).name === "string",
      )
    : [];
  const peopleIds = new Set(people.map((p) => p.id));

  const expenses = Array.isArray(g.expenses)
    ? g.expenses
        .map((e) => sanitizeExpense(e, peopleIds))
        .filter((e): e is Expense => e !== null)
    : [];

  return {
    id: g.id,
    name: typeof g.name === "string" ? g.name : "",
    people,
    expenses,
  };
}

/**
 * Validate and repair an AppState from untrusted input (localStorage or an
 * imported file). Drops malformed groups/expenses so the engine never sees a
 * record that would break the netting invariant.
 */
export function sanitizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") return emptyState();
  const s = raw as Partial<AppState>;
  if (!Array.isArray(s.groups)) return emptyState();

  const groups = s.groups
    .map((g) => sanitizeGroup(g))
    .filter((g): g is Group => g !== null);

  const activeGroupId =
    typeof s.activeGroupId === "string" &&
    groups.some((g) => g.id === s.activeGroupId)
      ? s.activeGroupId
      : groups.length > 0
        ? groups[0].id
        : null;

  return {
    groups,
    activeGroupId,
    schemaVersion: typeof s.schemaVersion === "number" ? s.schemaVersion : 1,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore write failures (quota, private mode, etc.)
  }
}
