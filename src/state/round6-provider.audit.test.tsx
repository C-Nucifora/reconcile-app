import { act, createElement, useEffect } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./AppContext";
import { emptyState, loadStoredState, STORAGE_KEY } from "./storage";
import { commitImageReferences, deleteUnusedImage, retainImageReferences } from "../lib/imageStore";
import type { AppState, Expense } from "../types";
import type { Action } from "./actions";

// Real provider hooks and load/save paths; only storage, lock scheduling and
// image reference calls are controlled. This does not exercise native IDB/DOM.
vi.mock("../lib/imageStore", () => ({
  retainImageReferences: vi.fn(),
  commitImageReferences: vi.fn(),
  deleteUnusedImage: vi.fn().mockResolvedValue(undefined),
}));

type Host = { type: string; props: Record<string, unknown>; children: Host[]; text?: string };
function remove(parent: Host, child: Host) {
  parent.children = parent.children.filter((node) => node !== child);
}
function append(parent: Host, child: Host) {
  remove(parent, child);
  parent.children.push(child);
}
const renderer = Reconciler({
  createInstance: (type: string, props: Host["props"]): Host => ({ type, props, children: [] }),
  createTextInstance: (text: string): Host => ({ type: "#text", text, props: {}, children: [] }),
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
    groups: [{
      id: "fictional-g", name: "Fictional precision trip",
      people: [{ id: "a", name: "Aster" }, { id: "b", name: "Birch" }],
      expenses: [{
        id: "fictional-e", description: "Fictional fare", amountCents: 101,
        payerId: "a", date: "2026-11-12", splitType: "equal",
        members: [{ personId: "a", value: 0 }, { personId: "b", value: 0 }],
        receiptImageId: "fictional-durable-receipt",
      }],
    }],
    activeGroupId: "fictional-g", schemaVersion: 1,
  };
}

function token(raw: string, original: string, replacement: string): string {
  expect(raw.split(original)).toHaveLength(2);
  return raw.replace(original, replacement);
}
const precisionCases = [
  { label: "fractional cents rounded to 101", original: '"amountCents":101', replacement: '"amountCents":101.00000000000000001' },
  { label: "nonzero equal weight underflowing to zero", original: '"personId":"a","value":0', replacement: '"personId":"a","value":1e-999999' },
];

function storage(initial: string) {
  let raw = initial;
  const getItem = vi.fn((key: string) => key === STORAGE_KEY ? raw : null);
  const setItem = vi.fn((key: string, value: string) => {
    expect(key).toBe(STORAGE_KEY);
    raw = value;
  });
  vi.stubGlobal("localStorage", { getItem, setItem });
  return { bytes: () => raw, external: (value: string) => { raw = value; }, setItem };
}

function heldWrites() {
  const queue: Array<() => void> = [];
  const request = vi.fn((_key: string, callback: () => string) => new Promise<string>((resolve, reject) => {
    queue.push(() => { try { resolve(callback()); } catch (error) { reject(error); } });
  }));
  vi.stubGlobal("navigator", { locks: { request } });
  return {
    request, size: () => queue.length,
    release: async () => {
      expect(queue).toHaveLength(1);
      await act(async () => { queue.shift()!(); });
    },
  };
}

const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});

async function mount() {
  const events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host: Host = { type: "root", props: {}, children: [] };
  const root = renderer.createContainer(host);
  let app!: ReturnType<typeof useApp>;
  function Probe() {
    const value = useApp();
    useEffect(() => { app = value; }, [value]);
    return null;
  }
  // The installed PDF reconciler needs changing siblings below an ordinary host.
  await act(async () => {
    renderer.updateContainer(createElement("audit-root", null, <AppProvider><Probe /></AppProvider>), root, null);
  });
  cleanups.push(async () => { await act(async () => { renderer.updateContainer(null, root, null); }); });
  function nodes(node = host): Host[] { return [node, ...node.children.flatMap((child) => nodes(child))]; }
  function text(node: Host): string { return node.text ?? node.children.map(text).join(""); }
  return {
    app: () => app,
    dispatch: async (action: Action) => {
      let accepted = false;
      await act(async () => { accepted = app.dispatch(action); });
      return accepted;
    },
    blocked: () => nodes().find((node) => node.type === "fieldset")!.props.disabled,
    alert: () => nodes().filter((node) => node.props.role === "alert").map(text).join(""),
    hasRetry: () => nodes().some((node) => node.type === "button" && text(node) === "Retry saving"),
    storageEvent: () => events.dispatchEvent(Object.assign(new Event("storage"), {
      key: STORAGE_KEY, storageArea: localStorage,
    })),
    unloadPrevented: () => {
      const event = new Event("beforeunload", { cancelable: true });
      // Node's legacy returnValue setter differs from the browser's writable one.
      Object.defineProperty(event, "returnValue", { value: true, writable: true });
      events.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

function replacement(receiptImageId: string, description: string): Expense {
  return { ...fixture().groups[0].expenses[0], receiptImageId, description };
}
function edit(expense: Expense): Action {
  return { type: "UPDATE_EXPENSE", groupId: "fictional-g", expense };
}
function references(...ids: string[]) { return [new Set(ids)]; }

describe("round6 precision guard through the live provider", () => {
  it.each(precisionCases)("blocks synchronous initialization actions for $label without touching bytes", async ({ original, replacement }) => {
    const raw = `\n${token(JSON.stringify(fixture()), original, replacement)}\t`;
    const stored = storage(raw);
    const locks = heldWrites();
    expect(loadStoredState()).toEqual({ state: emptyState(), raw, error: expect.stringMatching(/unsupported fractional precision.*preserved/) });
    const view = await mount();
    const initial = view.app().state;
    const dispatch = view.app().dispatch;
    await act(async () => {
      // Both actions would replace the fallback state if only the fieldset blocked editing.
      expect(dispatch({ type: "IMPORT_STATE", state: fixture() })).toBe(false);
      expect(dispatch({ type: "RESET" })).toBe(false);
    });
    expect(view.app().state).toBe(initial);
    expect(view.app().state).toEqual(emptyState());
    expect(view.blocked()).toBe(true);
    expect(view.alert()).toMatch(/unsupported fractional precision.*preserved/);
    expect(view.hasRetry()).toBe(false);
    expect(view.unloadPrevented()).toBe(false);
    expect(stored.bytes()).toBe(raw);
    expect(stored.setItem).not.toHaveBeenCalled();
    expect(locks.request).not.toHaveBeenCalled();
    expect(vi.mocked(retainImageReferences).mock.calls).toEqual([references()]);
    expect(vi.mocked(commitImageReferences).mock.calls).toEqual([references()]);
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });

  it.each([
    { label: "scientific cents and decimal integer weight", amount: "1.0100E+2", weight: "7.000", expectedWeight: 7 },
    { label: "negative-exponent integer cents and true zero", amount: "10100e-2", weight: "0.000E-999999", expectedWeight: 0 },
  ])("keeps $label editable through two canonical queued saves", async ({ amount, weight, expectedWeight }) => {
    let raw = token(JSON.stringify(fixture()), '"amountCents":101', `"amountCents":${amount}`);
    raw = `\n${token(raw, '"personId":"a","value":0', `"personId":"a","value":${weight}`)}\t`;
    const stored = storage(raw);
    const locks = heldWrites();
    const expected = fixture();
    expected.groups[0].expenses[0].members[0].value = expectedWeight;
    expect(loadStoredState()).toEqual({ state: expected, raw, error: null });
    const view = await mount();
    expect(view.blocked()).toBe(false);
    expect(view.alert()).toBe("");
    expect(stored.setItem).not.toHaveBeenCalled();
    expect(locks.request).not.toHaveBeenCalled();

    const first = { ...view.app().state.groups[0].expenses[0], receiptImageId: "fictional-first-draft", description: "Fictional first edit" };
    const latest = { ...first, receiptImageId: "fictional-latest-draft", description: "Fictional latest edit" };
    expect(await view.dispatch(edit(first))).toBe(true);
    expect(await view.dispatch(edit(latest))).toBe(true);
    expect(locks.size()).toBe(1);
    expect(stored.bytes()).toBe(raw);
    expect(view.unloadPrevented()).toBe(true);
    expect(vi.mocked(commitImageReferences).mock.calls).toEqual([references("fictional-durable-receipt")]);
    expect(deleteUnusedImage).not.toHaveBeenCalled();
    expect(vi.mocked(retainImageReferences).mock.calls).toEqual([
      references("fictional-durable-receipt"), references("fictional-first-draft"),
      references("fictional-latest-draft", "fictional-first-draft"),
    ]);
    await locks.release();
    expected.groups[0].expenses[0] = first;
    const firstSaved = JSON.stringify(expected);
    expect(stored.bytes()).toBe(firstSaved);
    expect(view.app().state.groups[0].expenses[0]).toEqual(latest);
    expect(view.unloadPrevented()).toBe(true);
    await locks.release();
    expected.groups[0].expenses[0] = latest;
    expect(stored.bytes()).toBe(JSON.stringify(expected));
    expect(loadStoredState()).toEqual({ state: expected, raw: JSON.stringify(expected), error: null });
    expect(view.app().state).toEqual(expected);
    expect(view.blocked()).toBe(false);
    expect(view.alert()).toBe("");
    expect(view.unloadPrevented()).toBe(false);
    expect(locks.size()).toBe(0);
    expect(locks.request).toHaveBeenCalledTimes(2);
    expect(stored.setItem.mock.calls).toEqual([
      [STORAGE_KEY, firstSaved],
      [STORAGE_KEY, JSON.stringify(expected)],
    ]);
    expect(vi.mocked(retainImageReferences).mock.calls).toEqual([
      references("fictional-durable-receipt"), references("fictional-first-draft"),
      references("fictional-latest-draft", "fictional-first-draft"),
      references("fictional-latest-draft"), references("fictional-latest-draft"),
    ]);
    expect(vi.mocked(commitImageReferences).mock.calls).toEqual([
      references("fictional-durable-receipt"), references("fictional-first-draft"), references("fictional-latest-draft"),
    ]);
    expect(vi.mocked(deleteUnusedImage).mock.calls).toEqual([["fictional-durable-receipt"], ["fictional-first-draft"]]);
    const writes = stored.setItem.mock.invocationCallOrder;
    const commits = vi.mocked(commitImageReferences).mock.invocationCallOrder;
    const deletes = vi.mocked(deleteUnusedImage).mock.invocationCallOrder;
    for (let i = 0; i < 2; i++) {
      expect(writes[i]).toBeLessThan(commits[i + 1]);
      expect(commits[i + 1]).toBeLessThan(deletes[i]);
    }
  });

  it.each([
    { ...precisionCases[0], event: true },
    { ...precisionCases[1], event: false },
  ])("preserves external $label and current receipts with storage event=$event", async ({ original, replacement: changedToken, event }) => {
    const raw = JSON.stringify(fixture());
    const external = `\n${token(raw, original, changedToken)}\t`;
    // The external mutation has the same parsed values; byte comparison must still stop it.
    expect(JSON.parse(external)).toEqual(fixture());
    const stored = storage(raw);
    const locks = heldWrites();
    const view = await mount();
    const first = replacement("fictional-first-draft", "Fictional first edit");
    const latest = replacement("fictional-latest-draft", "Fictional latest edit");
    expect(await view.dispatch(edit(first))).toBe(true);
    expect(await view.dispatch(edit(latest))).toBe(true);
    const inMemory = view.app().state;
    const capturedDispatch = view.app().dispatch;
    expect(locks.size()).toBe(1);
    expect(locks.request).toHaveBeenCalledOnce();
    expect(stored.setItem).not.toHaveBeenCalled();
    stored.external(external);
    expect(loadStoredState()).toEqual({ state: emptyState(), raw: external, error: expect.stringMatching(/unsupported fractional precision.*preserved/) });
    if (event) {
      await act(async () => {
        view.storageEvent();
        // Invoke captured handlers before React can render the disabled fieldset.
        expect(capturedDispatch({ type: "RESET" })).toBe(false);
        expect(capturedDispatch({ type: "IMPORT_STATE", state: fixture() })).toBe(false);
      });
      expect(view.blocked()).toBe(true);
      expect(view.alert()).toContain("Unsaved changes in this tab have not overwritten it");
    } else {
      expect(view.blocked()).toBe(false);
      expect(view.alert()).toBe("");
    }
    expect(vi.mocked(retainImageReferences).mock.calls).toEqual([
      references("fictional-durable-receipt"), references("fictional-first-draft"),
      references("fictional-latest-draft", "fictional-first-draft"),
    ]);
    await locks.release();
    await act(async () => {
      expect(capturedDispatch({ type: "RESET" })).toBe(false);
      expect(capturedDispatch(edit(replacement("fictional-rejected-draft", "Fictional rejected edit")))).toBe(false);
    });
    expect(view.app().state).toBe(inMemory);
    expect(view.app().state.groups[0].expenses[0]).toEqual(latest);
    expect(view.blocked()).toBe(true);
    expect(view.alert()).toMatch(/Another tab changed the saved data/);
    expect(view.alert()).toContain("Your changes are still in this tab");
    expect(view.hasRetry()).toBe(false);
    expect(view.unloadPrevented()).toBe(true);
    expect(stored.bytes()).toBe(external);
    expect(stored.setItem).not.toHaveBeenCalled();
    expect(locks.size()).toBe(0);
    expect(locks.request).toHaveBeenCalledOnce();
    expect(vi.mocked(retainImageReferences).mock.calls).toEqual([
      references("fictional-durable-receipt"), references("fictional-first-draft"),
      references("fictional-latest-draft", "fictional-first-draft"),
      references("fictional-latest-draft"), references("fictional-latest-draft"),
    ]);
    expect(vi.mocked(commitImageReferences).mock.calls).toEqual([references("fictional-durable-receipt")]);
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });
});
