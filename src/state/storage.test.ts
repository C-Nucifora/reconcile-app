import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyState, loadStoredState, sanitizeState, saveState, validateState, StaleStateError, STORAGE_KEY } from "./storage";
import { reducer } from "./reducer";
import { computeBalances } from "../engine/balances";
import type { AppState, Expense } from "../types";

const expense: Expense = {
  id: "e", description: "Fictional dinner", amountCents: 101, payerId: "a",
  date: "2026-01-01", splitType: "exact",
  members: [{ personId: "a", value: 50 }, { personId: "b", value: 51 }],
};
function fixture(): AppState {
  return { schemaVersion: 1, activeGroupId: "g", groups: [{ id: "g", name: "Fictional trip", people: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }], expenses: [structuredClone(expense)] }] };
}
function storage(raw: string | null) {
  const records = new Map(raw === null ? [] : [[STORAGE_KEY, raw]]);
  const api = {
    getItem: vi.fn((key: string) => records.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { records.set(key, value); }),
  };
  vi.stubGlobal("localStorage", api);
  let queue = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: vi.fn((_name: string, callback: () => unknown) => {
    const result = queue.then(callback);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }) } });
  return api;
}
afterEach(() => vi.unstubAllGlobals());

describe("saved state trust boundary", () => {
  it.each([
    ["duplicate people", (s: AppState) => { s.groups[0].people.push(s.groups[0].people[0]); }],
    ["missing payer", (s: AppState) => { s.groups[0].expenses[0].payerId = "missing"; }],
    ["overallocated exact split", (s: AppState) => { s.groups[0].expenses[0].members[0].value = 400; }],
    ["fractional cents", (s: AppState) => { s.groups[0].expenses[0].amountCents = 1.5; }],
    ["invalid date", (s: AppState) => { s.groups[0].expenses[0].date = "2026-02-30"; }],
    ["stale active group", (s: AppState) => { s.activeGroupId = "missing"; }],
    ["unknown field", (s: AppState) => { Object.assign(s.groups[0], { futureField: "keep me" }); }],
  ] as const)("does not silently repair saved %s", async (_name, damage) => {
    const state = fixture();
    damage(state);
    const raw = JSON.stringify(state);
    const api = storage(raw);
    expect(loadStoredState()).toMatchObject({ raw, error: expect.any(String) });
    await expect(saveState(fixture(), raw)).rejects.toThrow();
    expect(api.getItem(STORAGE_KEY)).toBe(raw);
    expect(api.setItem).not.toHaveBeenCalled();
  });
  it.each(["{broken", "null", "{}", '{"schemaVersion":2,"groups":[]}'])("preserves unreadable or incompatible input %s", (raw) => {
    const api = storage(raw);
    expect(loadStoredState().error).not.toBeNull();
    expect(api.getItem(STORAGE_KEY)).toBe(raw);
    expect(api.setItem).not.toHaveBeenCalled();
  });
  it("loads existing records and accepts the versionless v1 shape", () => {
    const state = fixture();
    storage(JSON.stringify(state));
    expect(loadStoredState()).toMatchObject({ state, error: null });
    const legacy = { ...state, schemaVersion: undefined };
    expect(sanitizeState(legacy).schemaVersion).toBe(1);
    const raw = JSON.stringify(legacy);
    storage(raw);
    expect(loadStoredState()).toMatchObject({ state, raw, error: null });
  });
  it("compares records independently of JSON property order", () => {
    const state = fixture();
    expect(validateState({ activeGroupId: state.activeGroupId, schemaVersion: 1, groups: state.groups })).toEqual(state);
  });
  it("bounds nesting, text and arrays before sanitization", () => {
    let deep: unknown = 0;
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(() => validateState({ ...fixture(), deep })).toThrow(/nesting/);
    const state = fixture();
    state.groups[0].name = "x".repeat(10_001);
    expect(() => validateState(state)).toThrow(/length/);
    expect(() => validateState({ ...fixture(), groups: Array(50_001).fill(null) })).toThrow(/record limit/);
    storage(" ".repeat(5_000_001));
    expect(loadStoredState().error).toMatch(/storage size/);
  });
  it("round trips a long fictional history without loss", async () => {
    const state = fixture();
    state.groups[0].expenses = Array.from({ length: 10_000 }, (_, i) => ({ ...expense, id: `fictional-${i}` }));
    const api = storage(null);
    const raw = await saveState(state, null);
    expect(loadStoredState()).toEqual({ state, raw, error: null });
    expect(api.setItem).toHaveBeenCalledTimes(1);
  });
  it("reports denied reads without attempting a write", () => {
    const api = storage(null);
    api.getItem.mockImplementation(() => { throw new Error("denied"); });
    expect(loadStoredState().error).toBe("denied");
    expect(api.setItem).not.toHaveBeenCalled();
  });
  it("rejects fractional and unsafe amounts, negative values and duplicate ids", () => {
    const state = fixture();
    const group = state.groups[0];
    group.people.push({ id: "a", name: "Duplicate" });
    group.expenses.push(expense, { ...expense, id: "unsafe", amountCents: Number.MAX_SAFE_INTEGER + 1 }, { ...expense, id: "fractional", amountCents: 1.5 });
    group.expenses[0].members.push({ personId: "a", value: 50 }, { personId: "b", value: -9 });
    const clean = sanitizeState(state).groups[0];
    expect(clean.people).toHaveLength(2);
    expect(clean.expenses).toHaveLength(1);
    expect(clean.expenses[0].members).toEqual(expense.members);
    expect([...computeBalances(clean).values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("normalizes exact overallocations and item totals with unique assignees", () => {
    const state = fixture();
    state.groups[0].expenses[0].members = [{ personId: "a", value: 300 }, { personId: "b", value: 1 }];
    state.groups[0].expenses.push({ ...expense, id: "items", amountCents: 999, members: [], items: [{ id: "i", name: "Fictional item", amountCents: 7, assigneeIds: ["a", "a", "missing"] }] });
    const clean = sanitizeState(state).groups[0];
    expect(clean.expenses[0].members.reduce((sum, member) => sum + member.value, 0)).toBe(101);
    expect(clean.expenses[1].amountCents).toBe(7);
    expect(clean.expenses[1].items?.[0].assigneeIds).toEqual(["a"]);
  });
  it("preserves the raw record when aggregate totals exceed safe cents", () => {
    const state = fixture();
    state.groups[0].expenses.push({ ...expense, id: "huge", amountCents: Number.MAX_SAFE_INTEGER });
    const raw = JSON.stringify(state);
    const api = storage(raw);
    expect(loadStoredState().error).toMatch(/range/);
    expect(api.getItem(STORAGE_KEY)).toBe(raw);
  });
});

describe("durable writes", () => {
  it("serializes two tabs that start from the same snapshot", async () => {
    const api = storage(null);
    const first = fixture();
    const second = { ...fixture(), groups: [] , activeGroupId: null };
    const results = await Promise.allSettled([saveState(first, null), saveState(second, null)]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1]).toMatchObject({ status: "rejected", reason: expect.any(StaleStateError) });
    expect(api.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.getItem(STORAGE_KEY)!)).toEqual(first);
  });
  it("fails closed when cross-tab locking is unavailable or denied", async () => {
    const api = storage(null);
    vi.stubGlobal("navigator", {});
    await expect(saveState(fixture(), null)).rejects.toThrow(/Web Locks/);
    vi.stubGlobal("navigator", { locks: { request: () => Promise.reject(new Error("denied lock")) } });
    await expect(saveState(fixture(), null)).rejects.toThrow("denied lock");
    expect(api.setItem).not.toHaveBeenCalled();
  });
  it("does not replace saved state when storage reads are denied during a write", async () => {
    const api = storage(null);
    api.getItem.mockImplementation(() => { throw new Error("denied"); });
    await expect(saveState(fixture(), null)).rejects.toThrow("denied");
    expect(api.setItem).not.toHaveBeenCalled();
  });
  it("rejects invalid new allocations rather than normalizing them", async () => {
    const state = fixture();
    const bad = { ...expense, id: "bad", members: [{ personId: "a", value: 400 }] };
    expect(reducer(state, { type: "ADD_EXPENSE", groupId: "g", expense: bad })).toBe(state);
    expect(reducer(state, { type: "UPDATE_EXPENSE", groupId: "g", expense: { ...bad, id: "e" } })).toBe(state);
    const api = storage(null);
    state.groups[0].expenses = [bad];
    await expect(saveState(state, null)).rejects.toThrow(/invalid/);
    expect(api.setItem).not.toHaveBeenCalled();
  });
  it("does not overwrite another tab's changed record", async () => {
    const api = storage("other tab");
    await expect(saveState(fixture(), null)).rejects.toThrow(/Another tab/);
    expect(api.setItem).not.toHaveBeenCalled();
    expect(api.getItem(STORAGE_KEY)).toBe("other tab");
  });
  it("surfaces quota failure and allows a retry against the same saved record", async () => {
    const previous = JSON.stringify(emptyState());
    const api = storage(previous);
    api.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    await expect(saveState(fixture(), previous)).rejects.toThrow("quota");
    expect(api.getItem(STORAGE_KEY)).toBe(previous);
    const next = await saveState(fixture(), previous);
    expect(JSON.parse(next)).toEqual(fixture());
    expect(api.getItem(STORAGE_KEY)).toBe(next);
  });
  it("makes repeated expense submissions idempotent and rejects stale targets", () => {
    const state = fixture();
    const next = reducer(state, { type: "ADD_EXPENSE", groupId: "g", expense });
    expect(next.groups[0].expenses).toHaveLength(1);
    expect(reducer(state, { type: "SET_ACTIVE_GROUP", groupId: "missing" })).toBe(state);
    expect(reducer(state, { type: "IMPORT_STATE", state: { ...state, schemaVersion: 2 } })).toBe(state);
  });
  it("rejects unsafe aggregate amounts before they reach the engine", () => {
    const state = fixture();
    const huge = { ...expense, id: "huge", amountCents: Number.MAX_SAFE_INTEGER, members: [{ personId: "a", value: Number.MAX_SAFE_INTEGER }] };
    expect(reducer(state, { type: "ADD_EXPENSE", groupId: "g", expense: huge })).toBe(state);
  });
});
