import type { AppState, Expense, ExpenseItem, Group } from "../types";
import { splitCents } from "../engine/money";

export const STORAGE_KEY = "reconcile.v1";
export const MAX_TEXT_LENGTH = 10_000;
const MAX_STORED_CHARS = 5_000_000;

// Bound work before walking untrusted records, including unknown properties.
function assertBounded(raw: unknown, depth = 0, budget = { remaining: 1_000_000, characters: MAX_STORED_CHARS }): void {
  if (--budget.remaining < 0 || depth > 12) throw new Error("Saved data exceeds the supported size or nesting limit.");
  if (typeof raw === "string") {
    if (raw.length > MAX_TEXT_LENGTH) throw new Error("Saved text exceeds the supported length.");
    budget.characters -= raw.length;
    if (budget.characters < 0) throw new Error("Saved data exceeds the supported storage size.");
  }
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw) && raw.length > 50_000) throw new Error("Saved history exceeds the supported record limit.");
    for (const value of Object.values(raw)) assertBounded(value, depth + 1, budget);
  }
}

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
    typeof it.amountCents === "number" && Number.isSafeInteger(it.amountCents)
      ? Math.trunc(it.amountCents)
      : NaN;
  if (!Number.isFinite(amountCents) || amountCents < 0) return null;

  const assigneeIds = Array.isArray(it.assigneeIds)
    ? [...new Set(it.assigneeIds.filter(
        (a): a is string => typeof a === "string" && peopleIds.has(a),
      ))]
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
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0, 10) !== e.date) return null;
  if (typeof e.payerId !== "string" || !peopleIds.has(e.payerId)) return null;
  if (typeof e.splitType !== "string" || !SPLIT_TYPES.has(e.splitType)) {
    return null;
  }

  const amountCents =
    typeof e.amountCents === "number" && Number.isSafeInteger(e.amountCents)
      ? Math.trunc(e.amountCents)
      : NaN;
  if (!Number.isFinite(amountCents) || amountCents < 0) return null;

  // Sanitize itemized line items, if any. An item that loses all assignees
  // becomes pending but is kept; the item list is what makes this an itemized
  // expense.
  const items = uniqueById(Array.isArray(e.items)
    ? e.items
        .map((it) => sanitizeItem(it, peopleIds))
        .filter((it): it is ExpenseItem => it !== null)
    : []);
  const itemTotal = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(itemTotal)) return null;

  // Keep only members that reference a known person and carry a finite value.
  let members = Array.isArray(e.members)
    ? e.members
        .filter(
          (m): m is { personId: string; value: number } =>
            !!m &&
            typeof m === "object" &&
            typeof (m as { personId?: unknown }).personId === "string" &&
            peopleIds.has((m as { personId: string }).personId) &&
            typeof (m as { value?: unknown }).value === "number" &&
            Number.isFinite((m as { value: number }).value) &&
            (m as { value: number }).value >= 0 &&
            (e.splitType !== "exact" || Number.isSafeInteger((m as { value: number }).value)) &&
            (e.splitType !== "shares" || (Number.isSafeInteger((m as { value: number }).value) && (m as { value: number }).value > 0)) &&
            (e.splitType !== "percent" || (m as { value: number }).value <= 100),
        )
        .map((m) => ({ personId: m.personId, value: m.value }))
    : [];

  const seenMembers = new Set<string>();
  const deduplicated = members.filter((m) => {
    if (seenMembers.has(m.personId)) return false;
    seenMembers.add(m.personId);
    return true;
  });
  members = deduplicated;

  const isItemized = items.length > 0;

  // An expense needs at least one valid item (itemized) or one valid member
  // (non-itemized) to be reconcilable; otherwise drop it.
  if (!isItemized && members.length === 0) return null;

  // Repair a non-itemized exact split whose values do not sum to amountCents by
  // scaling the weights so the parts add up.
  if (!isItemized && e.splitType === "exact") {
    const parts = splitCents(amountCents, members.map((m) => m.value));
    members.forEach((member, index) => { member.value = parts[index]; });
  }

  const expense: Expense = {
    id: e.id,
    description: typeof e.description === "string" ? e.description : "",
    amountCents: isItemized ? itemTotal : amountCents,
    payerId: e.payerId,
    date: e.date,
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
  if (typeof e.receiptImageId === "string" && e.receiptImageId !== "") {
    expense.receiptImageId = e.receiptImageId;
  }

  return expense;
}

function sanitizeGroup(raw: unknown): Group | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<Group>;
  if (typeof g.id !== "string" || g.id === "") return null;

  const people = uniqueById(Array.isArray(g.people)
    ? g.people.filter(
        (p): p is { id: string; name: string } =>
          !!p &&
          typeof p === "object" &&
          typeof (p as { id?: unknown }).id === "string" &&
          (p as { id: string }).id !== "" &&
          typeof (p as { name?: unknown }).name === "string",
      )
    : []).map((person) => ({ id: person.id, name: person.name }));
  const peopleIds = new Set(people.map((p) => p.id));

  const expenses = uniqueById(Array.isArray(g.expenses)
    ? g.expenses
        .map((e) => sanitizeExpense(e, peopleIds))
        .filter((e): e is Expense => e !== null)
    : []);

  if (!Number.isSafeInteger(expenses.reduce((sum, expense) => sum + expense.amountCents, 0))) {
    throw new Error("Saved expense totals exceed the supported integer-cent range.");
  }

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
  assertBounded(raw);
  if (!raw || typeof raw !== "object") return emptyState();
  const s = raw as Partial<AppState>;
  if (!Array.isArray(s.groups)) return emptyState();

  if (s.schemaVersion !== undefined && s.schemaVersion !== 1) {
    throw new Error("This data uses an unsupported version. Open it with a compatible version of Reconcile.");
  }

  const groups = uniqueById(s.groups
    .map((g) => sanitizeGroup(g))
    .filter((g): g is Group => g !== null));

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
    schemaVersion: 1,
  };
}

export interface StoredState {
  state: AppState;
  raw: string | null;
  error: string | null;
}

function sameRecord(raw: unknown, clean: unknown): boolean {
  if (raw === clean) return true;
  if (!raw || !clean || typeof raw !== "object" || typeof clean !== "object") return false;
  if (Array.isArray(raw) !== Array.isArray(clean)) return false;
  const left = raw as Record<string, unknown>;
  const right = clean as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && sameRecord(left[key], right[key]),
  );
}

/** Repair is available separately; persistence must never silently discard data. */
export function validateState(raw: unknown): AppState {
  const state = sanitizeState(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      !sameRecord({ ...raw, schemaVersion: (raw as AppState).schemaVersion ?? 1 }, state)) {
    throw new Error("Saved data contains invalid or unrecognized records. The original has been preserved. Recover a copy before editing.");
  }
  return state;
}

function parseStoredState(raw: string): AppState {
  if (raw.length > MAX_STORED_CHARS) throw new Error("Saved data exceeds the supported storage size.");
  return validateState(JSON.parse(raw));
}

export function loadStoredState(): StoredState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { state: emptyState(), raw, error: null };
    return { state: parseStoredState(raw), raw, error: null };
  } catch (error) {
    return {
      state: emptyState(), raw,
      error: error instanceof Error ? error.message : "Saved data could not be read.",
    };
  }
}

export function loadState(): AppState {
  return loadStoredState().state;
}

export class StaleStateError extends Error {
  constructor() { super("Another tab changed the saved data. Reload before making more changes."); }
}

/** Serialize cooperating tabs; checking localStorage alone is not atomic. */
export async function saveState(state: AppState, expectedRaw: string | null): Promise<string> {
  const raw = JSON.stringify(validateState(state));
  if (raw.length > MAX_STORED_CHARS) throw new Error("Saved data exceeds the supported storage size.");
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("This browser cannot safely save changes across tabs. Use a browser with Web Locks support.");
  }
  return navigator.locks.request(STORAGE_KEY, () => {
    if (localStorage.getItem(STORAGE_KEY) !== expectedRaw) throw new StaleStateError();
    if (expectedRaw !== null) parseStoredState(expectedRaw);
    localStorage.setItem(STORAGE_KEY, raw);
    return raw;
  });
}

function uniqueById<T extends { id: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}
