import type { AppState, Expense, Group } from "../types";

export const STORAGE_KEY = "reconcile.v1";

export function emptyState(): AppState {
  return { groups: [], activeGroupId: null, schemaVersion: 1 };
}

const SPLIT_TYPES = new Set(["equal", "exact", "percent", "shares"]);

/**
 * Validate and repair an expense loaded from untrusted storage / import.
 * Returns a cleaned Expense, or null when the record is unusable and should be
 * dropped. Members must reference the known people of the group; an exact split
 * whose member values do not sum to the total is repaired so the engine's
 * netting invariant holds.
 */
function sanitizeExpense(raw: unknown, peopleIds: Set<string>): Expense | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Expense>;

  if (typeof e.id !== "string" || e.id === "") return null;
  if (typeof e.payerId !== "string" || !peopleIds.has(e.payerId)) return null;
  if (typeof e.splitType !== "string" || !SPLIT_TYPES.has(e.splitType)) {
    return null;
  }
  if (!Array.isArray(e.members)) return null;

  const amountCents =
    typeof e.amountCents === "number" && Number.isFinite(e.amountCents)
      ? Math.trunc(e.amountCents)
      : NaN;
  if (!Number.isFinite(amountCents) || amountCents < 0) return null;

  // Keep only members that reference a known person and carry a finite value.
  const members = e.members
    .filter(
      (m): m is { personId: string; value: number } =>
        !!m &&
        typeof m === "object" &&
        typeof (m as { personId?: unknown }).personId === "string" &&
        peopleIds.has((m as { personId: string }).personId) &&
        typeof (m as { value?: unknown }).value === "number" &&
        Number.isFinite((m as { value: number }).value),
    )
    .map((m) => ({ personId: m.personId, value: m.value }));

  // A split with no valid members cannot be reconciled; drop it.
  if (members.length === 0) return null;

  // Repair an exact split whose values do not sum to amountCents by scaling the
  // last member so the parts add up (the engine also reconciles, but keeping
  // stored data consistent avoids surprising round-trips).
  if (e.splitType === "exact") {
    const sum = members.reduce((acc, m) => acc + Math.trunc(m.value), 0);
    const diff = amountCents - sum;
    if (diff !== 0) {
      const last = members[members.length - 1];
      last.value = Math.max(0, Math.trunc(last.value) + diff);
    }
  }

  return {
    id: e.id,
    description: typeof e.description === "string" ? e.description : "",
    amountCents,
    payerId: e.payerId,
    date: typeof e.date === "string" && e.date !== "" ? e.date : todayISO(),
    splitType: e.splitType,
    members,
  };
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
