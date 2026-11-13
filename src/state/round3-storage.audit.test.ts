import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState, Expense } from "../types";
import type { Action } from "./actions";
import { reducer } from "./reducer";
import { loadStoredState, saveState, StaleStateError, STORAGE_KEY } from "./storage";

const expense: Expense = {
  id: "fictional-expense", description: "Fictional ferry", amountCents: 101,
  payerId: "person-a", date: "2026-11-12", splitType: "exact",
  members: [{ personId: "person-a", value: 51 }, { personId: "person-b", value: 50 }],
  receiptImageId: "fictional-receipt",
};

function fixture(): AppState {
  return {
    groups: [{
      id: "fictional-group", name: "Fictional island",
      people: [{ id: "person-a", name: "Aster" }, { id: "person-b", name: "Birch" }],
      expenses: [structuredClone(expense)],
    }],
    activeGroupId: "fictional-group", schemaVersion: 1,
  };
}

const representations = ["canonical", "reordered", "versionless"] as const;
type Representation = typeof representations[number];
function storedBytes(kind: Representation): string {
  const state = fixture();
  if (kind === "canonical") return JSON.stringify(state);
  const record = kind === "versionless"
    ? { activeGroupId: state.activeGroupId, groups: state.groups }
    : { schemaVersion: 1, activeGroupId: state.activeGroupId, groups: state.groups };
  return `\n${JSON.stringify(record, null, 2)}\t `;
}

type Fault = "none" | "lock" | "read" | "quota";
type Outcome = { ok: true; raw: string } | { ok: false; error: unknown };
const observe = (promise: Promise<string>): Promise<Outcome> => promise.then(
  (raw) => ({ ok: true, raw }),
  (error: unknown) => ({ ok: false, error }),
);

// Release one callback at a time; scenarios submit requests in acquisition order.
function controlledStorage(initial: string | null) {
  let raw = initial;
  let fault: Fault = "none";
  const pending: Array<{ grant: () => void; deny: () => void }> = [];
  const writes: string[] = [];
  const api = {
    getItem: vi.fn((key: string) => {
      expect(key).toBe(STORAGE_KEY);
      if (fault === "read") throw new Error("fictional denied read");
      return raw;
    }),
    setItem: vi.fn((key: string, value: string) => {
      expect(key).toBe(STORAGE_KEY);
      if (fault === "quota") throw new Error("fictional quota");
      raw = value;
      writes.push(value);
    }),
  };
  vi.stubGlobal("localStorage", api);
  const request = vi.fn((name: string, callback: () => string) => {
    expect(name).toBe(STORAGE_KEY);
    return new Promise<string>((resolve, reject) => {
      pending.push({
        grant: () => { try { resolve(callback()); } catch (error) { reject(error); } },
        deny: () => reject(new Error("fictional denied lock")),
      });
    });
  });
  vi.stubGlobal("navigator", { locks: { request } });
  return {
    api, request, writes,
    bytes: () => raw,
    clear: () => { raw = null; },
    grant(index: number, nextFault: Fault = "none") {
      fault = nextFault;
      if (fault === "lock") pending[index].deny();
      else pending[index].grant();
      fault = "none";
    },
  };
}

const edits: Action[] = [
  { type: "RENAME_GROUP", groupId: "fictional-group", name: "Fictional lighthouse" },
  { type: "DELETE_EXPENSE", groupId: "fictional-group", expenseId: expense.id },
  { type: "RENAME_PERSON", groupId: "fictional-group", personId: "person-b", name: "Cedar" },
];

// This oracle applies the three disjoint edits without calling production helpers.
function expectedEdits(actors: number[]): AppState {
  const state = fixture();
  for (const actor of actors) {
    if (actor === 0) state.groups[0].name = "Fictional lighthouse";
    if (actor === 1) state.groups[0].expenses = [];
    if (actor === 2) state.groups[0].people[1].name = "Cedar";
  }
  return state;
}

const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const failures = ["lock", "read", "quota"] as const;
const schedules: Fault[][] = [["none", "none", "none"], ...failures.flatMap((first) =>
  failures.map((second) => [first, second, "none"] as Fault[]),
)];
const races = representations.flatMap((representation) => orders.flatMap((order) =>
  schedules.map((faults) => ({ representation, order, faults, label: `${representation} ${order.join("")} ${faults.join("/")}` })),
));

afterEach(() => vi.unstubAllGlobals());

describe("round3 storage three-actor acquisition and failure matrix", () => {
  it.each(failures)("preserves the committed winner when a stale writer later hits %s", async (fault) => {
    const original = storedBytes("versionless");
    const store = controlledStorage(original);
    const winner = observe(saveState(reducer(fixture(), edits[0]), original));
    const stale = observe(saveState(reducer(fixture(), edits[1]), original));
    store.grant(0);
    const committed = JSON.stringify(expectedEdits([0]));
    expect(await winner).toEqual({ ok: true, raw: committed });
    store.grant(1, fault);
    const result = await stale;
    if (fault === "quota") {
      // Revision rejection happens before any attempted write or quota failure.
      expect(result).toEqual({ ok: false, error: expect.any(StaleStateError) });
    } else {
      expect(result).toEqual({ ok: false, error: new Error(`fictional denied ${fault}`) });
    }
    expect(store.bytes()).toBe(committed);
    expect(store.writes).toEqual([committed]);
    const loaded = loadStoredState();
    expect(loaded).toEqual({ state: expectedEdits([0]), raw: committed, error: null });
    const retry = observe(saveState(reducer(loaded.state, edits[1]), loaded.raw));
    store.grant(2);
    const expected = JSON.stringify(expectedEdits([0, 1]));
    expect(await retry).toEqual({ ok: true, raw: expected });
    expect(store.writes).toEqual([committed, expected]);
  });

  it.each(races)("compares committed bytes through $label", async ({ representation, order, faults }) => {
    const original = storedBytes(representation);
    const store = controlledStorage(original);
    const actors = edits.map((action, actor) => {
      const loaded = loadStoredState();
      expect(loaded).toEqual({ state: fixture(), raw: original, error: null });
      const state = reducer(loaded.state, action);
      expect(state).toEqual(expectedEdits([actor]));
      return { state, revision: loaded.raw };
    });
    const attempts: Array<Promise<Outcome>> = [];
    for (const actor of order) attempts[actor] = observe(saveState(actors[actor].state, actors[actor].revision));
    expect(store.request).toHaveBeenCalledTimes(3);
    expect(store.writes).toEqual([]);

    let committed = original;
    let winner: number | null = null;
    for (let step = 0; step < order.length; step++) {
      const actor = order[step];
      store.grant(step, faults[step]);
      const result = await attempts[actor];
      if (faults[step] !== "none") {
        expect(result).toEqual({ ok: false, error: new Error(`fictional ${faults[step] === "quota" ? "quota" : `denied ${faults[step]}`}`) });
      } else if (winner !== null) {
        expect(result).toEqual({ ok: false, error: expect.any(StaleStateError) });
      } else {
        winner = actor;
        committed = JSON.stringify(expectedEdits([actor]));
        expect(result).toEqual({ ok: true, raw: committed });
      }
      expect(store.bytes()).toBe(committed);
      expect(actors.map((entry) => entry.revision)).toEqual([original, original, original]);
    }
    expect(winner).not.toBeNull();
    expect(store.writes).toEqual([committed]);

    const retryActor = order.find((actor) => actor !== winner)!;
    const staleRetry = observe(saveState(actors[retryActor].state, actors[retryActor].revision));
    store.grant(3);
    expect(await staleRetry).toEqual({ ok: false, error: expect.any(StaleStateError) });
    expect(store.bytes()).toBe(committed);

    const refreshed = loadStoredState();
    expect(refreshed).toEqual({ state: expectedEdits([winner!]), raw: committed, error: null });
    const merged = reducer(refreshed.state, edits[retryActor]);
    const expected = expectedEdits([winner!, retryActor]);
    expect(merged).toEqual(expected);
    const retry = observe(saveState(merged, refreshed.raw));
    store.grant(4);
    const finalBytes = JSON.stringify(expected);
    expect(await retry).toEqual({ ok: true, raw: finalBytes });
    expect(store.writes).toEqual([committed, finalBytes]);
    expect(loadStoredState()).toEqual({ state: expected, raw: finalBytes, error: null });
  });
});

describe("round3 storage deletion and recreation", () => {
  const removals = ["expense", "group", "reset", "clear"] as const;
  it.each(representations.flatMap((representation) => removals.map((removal) => ({ representation, removal }))))(
    "prevents resurrection after $representation $removal and recreation", async ({ representation, removal }) => {
      const original = storedBytes(representation);
      const store = controlledStorage(original);
      const staleCandidate = reducer(fixture(), edits[0]);
      let expected: AppState;
      let removedRaw: string | null;
      if (removal === "clear") {
        store.clear();
        expected = { groups: [], activeGroupId: null, schemaVersion: 1 };
        removedRaw = null;
      } else {
        const action: Action = removal === "expense"
          ? { type: "DELETE_EXPENSE", groupId: "fictional-group", expenseId: expense.id }
          : removal === "group" ? { type: "DELETE_GROUP", groupId: "fictional-group" } : { type: "RESET" };
        expected = removal === "expense" ? expectedEdits([1]) : { groups: [], activeGroupId: null, schemaVersion: 1 };
        const removed = reducer(fixture(), action);
        expect(removed).toEqual(expected);
        const saving = observe(saveState(removed, original));
        store.grant(0);
        removedRaw = JSON.stringify(expected);
        expect(await saving).toEqual({ ok: true, raw: removedRaw });
      }
      const staleIndex = store.request.mock.calls.length;
      const stale = observe(saveState(staleCandidate, original));
      store.grant(staleIndex);
      expect(await stale).toEqual({ ok: false, error: expect.any(StaleStateError) });
      expect(loadStoredState()).toEqual({ state: expected, raw: removedRaw, error: null });

      const oldCandidate = reducer(expected, { type: "RESET" });
      const ids = ["new-group", "new-person"];
      vi.stubGlobal("crypto", { randomUUID: () => ids.shift()! });
      let recreated = reducer(expected, { type: "ADD_GROUP", name: "Fictional second island" });
      recreated = reducer(recreated, { type: "ADD_PERSON", groupId: "new-group", name: "Elm" });
      const newExpense: Expense = {
        id: "new-expense", description: "Fictional tram", amountCents: 7,
        payerId: "new-person", date: "2026-11-12", splitType: "equal",
        members: [{ personId: "new-person", value: 1 }],
      };
      recreated = reducer(recreated, { type: "ADD_EXPENSE", groupId: "new-group", expense: newExpense });
      const expectedRecreated: AppState = {
        groups: [...expected.groups, {
          id: "new-group", name: "Fictional second island",
          people: [{ id: "new-person", name: "Elm" }], expenses: [newExpense],
        }],
        activeGroupId: "new-group", schemaVersion: 1,
      };
      expect(recreated).toEqual(expectedRecreated);
      const creationIndex = store.request.mock.calls.length;
      const creation = observe(saveState(recreated, removedRaw));
      store.grant(creationIndex);
      const finalBytes = JSON.stringify(expectedRecreated);
      expect(await creation).toEqual({ ok: true, raw: finalBytes });
      const oldAttempt = observe(saveState(oldCandidate, removedRaw));
      store.grant(creationIndex + 1);
      expect(await oldAttempt).toEqual({ ok: false, error: expect.any(StaleStateError) });
      expect(loadStoredState()).toEqual({ state: expectedRecreated, raw: finalBytes, error: null });
      expect(store.bytes()).not.toContain("fictional-receipt");
    },
  );
});

describe("round3 byte revisions and queued snapshots", () => {
  it.each(representations)("captures the %s candidate before waiting for a lock", async (representation) => {
    const original = storedBytes(representation);
    const store = controlledStorage(original);
    const candidate = reducer(fixture(), edits[0]);
    const attempt = observe(saveState(candidate, original));
    candidate.groups[0].name = "Fictional later mutation";
    candidate.groups[0].expenses[0].members[0].value = -1;
    store.grant(0);
    const expected = expectedEdits([0]);
    const expectedRaw = JSON.stringify(expected);
    expect(await attempt).toEqual({ ok: true, raw: expectedRaw });
    expect(loadStoredState()).toEqual({ state: expected, raw: expectedRaw, error: null });
  });

  it.each(["reordered", "versionless"] as const)("refuses a reconstructed revision for %s original bytes", async (representation) => {
    const original = storedBytes(representation);
    const store = controlledStorage(original);
    const loaded = loadStoredState();
    const reconstructed = JSON.stringify(loaded.state);
    expect(reconstructed).not.toBe(original);
    const attempt = observe(saveState(reducer(loaded.state, edits[0]), reconstructed));
    store.grant(0);
    expect(await attempt).toEqual({ ok: false, error: expect.any(StaleStateError) });
    expect(store.bytes()).toBe(original);
    expect(store.writes).toEqual([]);
  });
});
