import { act, createElement, useEffect, type ReactNode } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./AppContext";
import { reducer } from "./reducer";
import { emptyState, loadStoredState, saveState, STORAGE_KEY, validateState } from "./storage";
import { computeBalances, computeExpenseShares, pendingCents } from "../engine/balances";
import type { Action } from "./actions";
import type { AppState, Expense } from "../types";

// Use the installed React reconciler to execute real hooks/effects, with an
// in-memory host tree. Storage and Web Locks are deterministic fault boundaries.
type Host = { type: string; props: Record<string, unknown>; children: Host[]; text?: string };
const append = (parent: Host, child: Host) => { parent.children.push(child); };
const remove = (parent: Host, child: Host) => {
  parent.children = parent.children.filter((node) => node !== child);
};
const renderer = Reconciler({
  createInstance: (type: string, props: Host["props"]): Host => ({ type, props, children: [] }),
  createTextInstance: (text: string): Host => ({ type: "text", text, props: {}, children: [] }),
  appendChild: append,
  appendChildToContainer: append,
  insertBefore: (parent: Host, child: Host, before: Host) => {
    remove(parent, child);
    parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  removeChild: remove,
  removeChildFromContainer: remove,
  commitUpdate: (node: Host, _payload: unknown, _type: string, _old: unknown, props: Host["props"]) => { node.props = props; },
  commitTextUpdate: (node: Host, _old: string, text: string) => { node.text = text; },
  resetAfterCommit: () => {},
});

function fixture(): AppState {
  return {
    schemaVersion: 1, activeGroupId: "g", groups: [{
      id: "g", name: "Fictional field trip", expenses: [],
      people: [{ id: "a", name: "Aster" }, { id: "b", name: "Birch" }, { id: "c", name: "Cedar" }],
    }],
  };
}

function expense(id = "e"): Expense {
  return {
    id, description: "Fictional fare", amountCents: 101, date: "2026-11-12",
    payerId: "a", splitType: "equal", members: [{ personId: "a", value: 0 }, { personId: "b", value: 0 }],
  };
}

function storage(initial: string | null) {
  let raw = initial;
  const api = {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => { raw = value; }),
  };
  vi.stubGlobal("localStorage", api);
  vi.stubGlobal("navigator", { locks: { request: async (_key: string, callback: () => string) => callback() } });
  return { api, raw: () => raw, external: (value: string | null) => { raw = value; } };
}

function controlledLocks() {
  const queue: Array<() => void> = [];
  vi.stubGlobal("navigator", { locks: { request: (_key: string, callback: () => string) => new Promise<string>((resolve, reject) => {
    queue.push(() => { try { resolve(callback()); } catch (error) { reject(error); } });
  }) } });
  return {
    size: () => queue.length,
    release: async () => {
      expect(queue.length).toBe(1);
      await act(async () => { queue.shift()!(); });
    },
  };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(children?: ReactNode) {
  const events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const tree: Host = { type: "root", props: {}, children: [] };
  const root = renderer.createContainer(tree);
  let app!: ReturnType<typeof useApp>;
  function Probe() {
    const value = useApp();
    useEffect(() => { app = value; }, [value]);
    return null;
  }
  // The PDF host has no container insertion hook. Keep changing provider
  // siblings inside one ordinary host, as the lifecycle fixture does.
  await act(async () => { renderer.updateContainer(createElement("audit-root", null, <AppProvider><Probe />{children}</AppProvider>), root, null); });
  cleanups.push(async () => { await act(async () => { renderer.updateContainer(null, root, null); }); });
  function nodes(node = tree): Host[] { return [node, ...node.children.flatMap((child) => nodes(child))]; }
  return {
    app: () => app,
    dispatch: async (action: Action) => {
      let accepted = false;
      await act(async () => { accepted = app.dispatch(action); });
      return accepted;
    },
    alert: () => nodes().find((node) => node.props.role === "alert"),
    blocked: () => nodes().find((node) => node.type === "fieldset")!.props.disabled,
    retry: async () => {
      const button = nodes().find((node) => node.type === "button" && node.props.children === "Retry saving");
      expect(button).toBeDefined();
      await act(async () => { (button!.props.onClick as () => void)(); });
    },
    storageEvent: async (key: string | null = STORAGE_KEY) => {
      const event = Object.assign(new Event("storage"), { key, storageArea: localStorage });
      await act(async () => { events.dispatchEvent(event); });
    },
    unloadPrevented: () => {
      const event = new Event("beforeunload", { cancelable: true });
      // Node's legacy Event.returnValue setter is read-only; the browser's is writable.
      Object.defineProperty(event, "returnValue", { value: true, writable: true });
      events.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

describe("round1 persistence live lifecycle", () => {
  it.each([1, 2, 3, 4, 5, 6])("preserves six queued edits after %i consecutive failures and retry while pending", async (failures) => {
    const stored = storage(JSON.stringify(fixture()));
    const locks = controlledLocks();
    for (let i = 0; i < failures; i++) stored.api.setItem.mockImplementationOnce(() => { throw new Error("fictional quota failure"); });
    const view = await mount();
    for (let i = 0; i < 6; i++) await view.dispatch({ type: "ADD_EXPENSE", groupId: "g", expense: expense(`fare-${i}`) });
    expect(view.unloadPrevented()).toBe(true);
    await locks.release();
    expect(view.alert()).toBeDefined();
    // Queue two retries behind the five existing states, then queue a new edit.
    await view.retry();
    await view.retry();
    await view.dispatch({ type: "RENAME_GROUP", groupId: "g", name: "Fictional final name" });
    for (let i = 0; i < 8; i++) await locks.release();
    expect(locks.size()).toBe(0);
    expect(stored.api.setItem).toHaveBeenCalledTimes(9);
    expect(loadStoredState()).toMatchObject({ state: view.app().state, error: null });
    expect(loadStoredState().state.groups[0].expenses).toHaveLength(6);
    expect(view.alert()).toBeUndefined();
    expect(view.unloadPrevented()).toBe(false);
  });

  it.each(["clear", "replace", "corrupt"])("preserves external %s while a lock is pending", async (kind) => {
    const original = JSON.stringify(fixture());
    const stored = storage(original);
    const locks = controlledLocks();
    const view = await mount();
    await view.dispatch({ type: "ADD_EXPENSE", groupId: "g", expense: expense() });
    await view.dispatch({ type: "ADD_PERSON", groupId: "g", name: "Dahlia" });
    const external = kind === "clear" ? null : kind === "corrupt" ? "{fictional broken JSON" : JSON.stringify(emptyState());
    stored.external(external);
    await view.storageEvent(kind === "clear" ? null : STORAGE_KEY);
    await locks.release();
    expect(stored.raw()).toBe(external);
    expect(stored.api.setItem).not.toHaveBeenCalled();
    expect(locks.size()).toBe(0);
    expect(view.blocked()).toBe(true);
    expect(view.alert()).toBeDefined();
    expect(view.unloadPrevented()).toBe(true);
    expect(view.app().state.groups[0].expenses).toHaveLength(1);
    expect(await view.dispatch({ type: "DELETE_GROUP", groupId: "g" })).toBe(false);
  });

  it("detects external changes at lock acquisition even before the storage event", async () => {
    const stored = storage(JSON.stringify(fixture()));
    const locks = controlledLocks();
    const view = await mount();
    await view.dispatch({ type: "ADD_EXPENSE", groupId: "g", expense: expense() });
    const external = JSON.stringify(emptyState());
    stored.external(external);
    await locks.release();
    expect(stored.raw()).toBe(external);
    expect(view.blocked()).toBe(true);
    expect(view.unloadPrevented()).toBe(true);
  });

  it("ignores queued storage events describing the already loaded bytes", async () => {
    const stored = storage(JSON.stringify(fixture()));
    const view = await mount();
    await view.storageEvent();
    expect(view.blocked()).toBe(false);
    expect(stored.api.setItem).not.toHaveBeenCalled();
    expect(await view.dispatch({ type: "ADD_EXPENSE", groupId: "g", expense: expense() })).toBe(true);
    expect(loadStoredState().state).toEqual(view.app().state);
  });
});

describe("round1 reducer and persistence contract", () => {
  const tooLong = "F".repeat(10_001);
  const invalidNames: Action[] = [
    { type: "ADD_GROUP", name: tooLong },
    { type: "RENAME_GROUP", groupId: "g", name: tooLong },
    { type: "ADD_PERSON", groupId: "g", name: tooLong },
    { type: "RENAME_PERSON", groupId: "g", personId: "a", name: tooLong },
  ];
  it.each(invalidNames.map((action) => [action.type, action] as const))("rejects an unsaveable %s before replacing live state", async (_type, action) => {
    const original = fixture();
    storage(JSON.stringify(original));
    const view = await mount();
    expect(await view.dispatch(action), "10,001-character names must be rejected before poisoning state").toBe(false);
    expect(view.app().state).toEqual(original);
    expect(await view.dispatch({ type: "ADD_EXPENSE", groupId: "g", expense: expense() })).toBe(true);
    expect(loadStoredState().state.groups[0].expenses).toHaveLength(1);
  });

  it("does not let an invalid group rename disable otherwise valid expense additions", async () => {
    const original = JSON.stringify(fixture());
    const stored = storage(original);
    const view = await mount();
    expect(await view.dispatch({ type: "RENAME_GROUP", groupId: "g", name: tooLong })).toBe(false);
    expect(view.alert()).toBeUndefined();
    expect(stored.raw()).toBe(original);
    expect(await view.dispatch({ type: "ADD_EXPENSE", groupId: "g", expense: expense() }), "a rejected name must not make all valid expenses fail").toBe(true);
  });

  it("rejects an expense that crosses the aggregate serialized size bound", async () => {
    const state = fixture();
    // Every individual text is supported. Escaping expands each description to
    // 60,000 bytes, so only 83 existing records are needed to reach the boundary.
    state.groups[0].expenses = Array.from({ length: 83 }, (_, index) => ({ ...expense(`large-${index}`), description: "\u0001".repeat(10_000) }));
    const stored = storage(null);
    const previous = await saveState(state, null);
    expect(previous.length).toBeLessThan(5_000_000);
    const overflow = { ...expense("overflow"), description: "\u0001".repeat(10_000) };
    const oversized = { ...state, groups: [{ ...state.groups[0], expenses: [...state.groups[0].expenses, overflow] }] };
    await expect(saveState(oversized, previous)).rejects.toThrow(/storage size/);
    expect(stored.raw()).toBe(previous);
    const next = reducer(state, { type: "ADD_EXPENSE", groupId: "g", expense: overflow });
    expect(next === state, "accepted reducer output must respect the deterministic storage bound").toBe(true);
    await expect(saveState(next, previous)).resolves.toBe(previous);
  });

  it("keeps stale rename and equal-name actions as no-ops without writes", async () => {
    const state = fixture();
    const stored = storage(JSON.stringify(state));
    const view = await mount();
    const actions: Action[] = [
      { type: "RENAME_PERSON", groupId: "g", personId: "missing", name: "Fictional" },
      { type: "RENAME_PERSON", groupId: "g", personId: "a", name: "Aster" },
      { type: "RENAME_GROUP", groupId: "g", name: state.groups[0].name },
    ];
    for (const action of actions) {
      expect(reducer(state, action) === state, action.type).toBe(true);
      expect(await view.dispatch(action), action.type).toBe(false);
    }
    expect(stored.api.setItem).not.toHaveBeenCalled();
  });

  it("saves a rejected size-bound expense after deleting one old record", async () => {
    const state = fixture();
    state.groups[0].expenses = Array.from({ length: 83 }, (_, index) => ({ ...expense(`large-${index}`), description: "\u0001".repeat(10_000) }));
    const stored = storage(null);
    const previous = await saveState(state, null);
    stored.api.setItem.mockClear();
    const view = await mount();
    const action: Action = { type: "ADD_EXPENSE", groupId: "g", expense: { ...expense("retained-draft"), description: "\u0001".repeat(10_000) } };
    expect(await view.dispatch(action)).toBe(false);
    expect(stored.api.setItem).not.toHaveBeenCalled();
    expect(stored.raw()).toBe(previous);
    expect(await view.dispatch({ type: "DELETE_EXPENSE", groupId: "g", expenseId: "large-0" })).toBe(true);
    expect(await view.dispatch(action)).toBe(true);
    expect(loadStoredState().state).toEqual(view.app().state);
    expect(loadStoredState().state.groups[0].expenses[82].id).toBe("retained-draft");
  });

  it("recovers from the people record-count bound after a deletion", async () => {
    const state = fixture();
    state.groups[0].people = Array.from({ length: 50_000 }, (_, index) => ({ id: `p${index}`, name: "Fictional" }));
    expect(JSON.stringify(state).length).toBeLessThan(5_000_000);
    const stored = storage(null);
    const previous = await saveState(state, null);
    const action: Action = { type: "ADD_PERSON", groupId: "g", name: "Fictional retry" };
    expect(reducer(state, action)).toBe(state);
    expect(stored.raw()).toBe(previous);
    const smaller = reducer(state, { type: "REMOVE_PERSON", groupId: "g", personId: "p0" });
    const retried = reducer(smaller, action);
    expect(retried.groups[0].people).toHaveLength(50_000);
    expect(retried.groups[0].people[49_999].name).toBe("Fictional retry");
    await saveState(retried, previous);
    expect(loadStoredState().state).toEqual(retried);
  });

  it("checks the canonical size added by missing-version migration and preserves rejected bytes", async () => {
    const state = fixture();
    state.groups[0].expenses = Array.from({ length: 84 }, (_, index) => ({ ...expense(`migration-${index}`), description: index < 83 ? "\u0001".repeat(10_000) : "" }));
    const room = 5_000_001 - JSON.stringify(state).length;
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThanOrEqual(60_000);
    const padding = "\u0001".repeat(Math.floor(room / 6)) + "F".repeat(room % 6);
    state.groups[0].expenses[83].description = padding;
    expect(JSON.stringify(state)).toHaveLength(5_000_001);
    const { schemaVersion: _version, ...legacy } = state;
    const raw = JSON.stringify(legacy);
    expect(raw.length).toBeLessThan(5_000_000);
    const stored = storage(raw);
    expect(loadStoredState()).toMatchObject({ raw, error: expect.any(String) });
    expect(stored.api.setItem).not.toHaveBeenCalled();
    expect(stored.raw()).toBe(raw);
    state.groups[0].expenses[83].description = padding.slice(0, -10);
    const smaller = JSON.stringify(legacy);
    stored.external(smaller);
    const loaded = loadStoredState();
    expect(loaded.error).toBeNull();
    await saveState(loaded.state, loaded.raw);
    expect(loadStoredState().state).toEqual(state);
  });

  it("conserves and durably round-trips 300 bounded deterministic action steps", async () => {
    let nextId = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `round1-person-${nextId++}` });
    let seed = 0x726f756e;
    const random = (maximum: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % maximum; };
    let state = fixture();
    const stored = storage(null);
    let raw: string | null = null;
    for (let step = 0; step < 300; step++) {
      const group = state.groups[0];
      const person = group.people[random(group.people.length)];
      const action: Action = step % 11 === 0 ? { type: "ADD_PERSON", groupId: "g", name: `Fictional ${step}` }
        : step % 13 === 0 && group.people.length > 2 ? { type: "REMOVE_PERSON", groupId: "g", personId: person.id }
        : step % 7 === 0 ? { type: "DELETE_EXPENSE", groupId: "g", expenseId: group.expenses[0]?.id ?? "absent" }
        : step % 5 === 0 ? { type: "RENAME_PERSON", groupId: "g", personId: person.id, name: `Renamed ${step}` }
        : step % 3 === 0 ? { type: "RENAME_GROUP", groupId: "g", name: `Trip ${step}` }
        : { type: "ADD_EXPENSE", groupId: "g", expense: {
          ...expense(`sequence-${step}`), payerId: person.id, amountCents: 17, members: [],
          items: [
            { id: "assigned", name: "Fictional ticket", amountCents: 10, assigneeIds: group.people.map((p) => p.id) },
            { id: "pending", name: "Fictional unassigned", amountCents: 7, assigneeIds: [] },
          ],
        } };
      state = reducer(state, action);
      expect(validateState(state), `step ${step}`).toEqual(state);
      for (const e of state.groups[0].expenses) {
        const assigned = [...computeExpenseShares(e).values()].reduce((total, value) => total + BigInt(value), 0n);
        expect(assigned + BigInt(pendingCents(e))).toBe(BigInt(e.amountCents));
      }
      expect([...computeBalances(state.groups[0]).values()].reduce((total, value) => total + BigInt(value), 0n)).toBe(0n);
      raw = await saveState(state, raw);
      expect(loadStoredState()).toEqual({ raw: stored.raw(), state, error: null });
    }
  });

  it("migrates only a missing version and preserves unsupported or damaged bytes", async () => {
    const valid = fixture();
    const { schemaVersion: _version, ...legacy } = valid;
    const stored = storage(JSON.stringify(legacy));
    const loaded = loadStoredState();
    expect(loaded.error).toBeNull();
    await saveState(loaded.state, loaded.raw);
    expect(loadStoredState().state).toEqual(valid);
    for (const version of [null, 0, 2, "1"]) {
      const raw = JSON.stringify({ ...valid, schemaVersion: version });
      stored.external(raw);
      expect(loadStoredState().error).not.toBeNull();
      expect(stored.raw()).toBe(raw);
    }
  });

  it("blocks a compact numeric history whose canonical form exceeds the storage bound", () => {
    const state = fixture();
    state.groups[0].people = Array.from({ length: 1_000 }, (_, index) => ({ id: `p${index}`, name: `Fictional ${index}` }));
    const members = state.groups[0].people.map((person) => ({ personId: person.id, value: 1e20 }));
    state.groups[0].expenses = Array.from({ length: 120 }, (_, index) => ({
      ...expense(`compact-${index}`), payerId: "p0", members,
    }));
    // These equal-split weights are finite and ignored by the engine. Both JSON
    // number spellings are valid, but stringify expands 1e20 by 17 characters.
    const canonical = JSON.stringify(state);
    const compact = canonical.replace(/100000000000000000000/g, "1e20");
    expect(compact.length).toBeLessThan(5_000_000);
    expect(canonical.length).toBeGreaterThan(5_000_000);
    const stored = storage(compact);
    const loaded = loadStoredState();
    expect(loaded.error, "unsupported canonical size must be identified before editing").not.toBeNull();
    expect(loaded.raw).toBe(compact);
    expect(stored.raw()).toBe(compact);
  });
});
