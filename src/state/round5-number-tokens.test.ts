import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../types";
import { emptyState, loadStoredState, saveState, STORAGE_KEY } from "./storage";

function fixture(): AppState {
  return {
    groups: [{
      id: "fictional-number-group", name: "Fictional number tokens",
      people: [{ id: "a", name: "Fictional Aster" }, { id: "b", name: "Fictional Birch" }],
      expenses: [{
        id: "fictional-ferry", description: "Fictional ferry", amountCents: 101,
        payerId: "a", date: "2026-11-12", splitType: "equal",
        members: [{ personId: "a", value: 7 }, { personId: "b", value: 1 }],
      }],
    }], activeGroupId: "fictional-number-group", schemaVersion: 1,
  };
}

function storage(initial: string | null) {
  let raw = initial;
  let failWrite = false;
  const setItem = vi.fn((key: string, value: string) => {
    expect(key).toBe(STORAGE_KEY);
    if (failWrite) throw new Error("fictional quota");
    raw = value;
  });
  const request = vi.fn(async (_name: string, callback: () => string) => callback());
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === STORAGE_KEY ? raw : null, setItem });
  vi.stubGlobal("navigator", { locks: { request } });
  return { bytes: () => raw, setItem, request, failWrites: (fail: boolean) => { failWrite = fail; } };
}

function replaceToken(field: "amountCents" | "value", token: string): string {
  const raw = JSON.stringify(fixture());
  const original = field === "amountCents" ? '"amountCents":101' : '"value":7';
  expect(raw.split(original)).toHaveLength(2);
  return raw.replace(original, `"${field}":${token}`);
}

afterEach(() => vi.unstubAllGlobals());

describe("round5 stored numeric source precision", () => {
  it.each([
    ["amountCents", "101.0"], ["amountCents", "1.01e2"], ["amountCents", "10100e-2"],
    ["amountCents", "1.0100E+2"], ["amountCents", `101${"0".repeat(6_000)}e-6000`],
    ["value", "0"], ["value", "-0"], ["value", "0.000"], ["value", "-0.00E+999999"],
    ["value", `0e-${"9".repeat(6_000)}`], ["value", `0e+${"9".repeat(6_000)}`],
    ["value", "1000e-3"], ["value", "7.0000"], ["value", "0.333"], ["value", "3.33e-1"],
  ] as const)("loads and saves valid %s source case %#", async (field, token) => {
    const raw = `\n${replaceToken(field, token)}\t`;
    const expected = JSON.parse(raw) as AppState;
    const store = storage(raw);
    expect(loadStoredState()).toEqual({ state: expected, raw, error: null });
    expect(store.setItem).not.toHaveBeenCalled();
    const canonical = JSON.stringify(expected);
    await expect(saveState(expected, raw)).resolves.toBe(canonical);
    expect(store.bytes()).toBe(canonical);
    expect(store.request).toHaveBeenCalledOnce();
    expect(store.setItem).toHaveBeenCalledOnce();
    expect(loadStoredState()).toEqual({ state: JSON.parse(canonical), raw: canonical, error: null });
  });

  it.each([
    ["amountCents", "101.00000000000000001"], ["value", "7.0000000000000001"],
    ["value", "9007199254740990.1"], ["value", "1e-999999"], ["value", "-1e-999999"],
    ["value", `1e-${"9".repeat(6_000)}`],
    ["amountCents", `101${"0".repeat(6_000)}1e-6001`],
  ] as const)("preserves unsupported %s source case %# on load and save", async (field, token) => {
    const raw = replaceToken(field, token);
    const store = storage(raw);
    expect(loadStoredState()).toEqual({ state: emptyState(), raw, error: expect.stringMatching(/unsupported fractional precision.*preserved/) });
    await expect(saveState(fixture(), raw)).rejects.toThrow(/unsupported fractional precision.*preserved/);
    expect(store.bytes()).toBe(raw);
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it.each([0, -0, Number.MIN_VALUE, 1e-7, 0.1, 33.33, Math.PI, 1e20, 1e21, Number.MAX_VALUE])(
    "accepts JSON.stringify output for finite equal weight %s", async (value) => {
      const state = fixture();
      state.groups[0].expenses[0].members[0].value = value;
      const raw = JSON.stringify(state);
      const store = storage(raw);
      expect(loadStoredState()).toEqual({ state: JSON.parse(raw), raw, error: null });
      await expect(saveState(state, raw)).resolves.toBe(raw);
      expect(store.bytes()).toBe(raw);
    },
  );

  it("accepts ordinary fractional percentages and skips escaped numeric-looking strings and keys", async () => {
    const state = fixture();
    const expense = state.groups[0].expenses[0];
    expense.splitType = "percent";
    expense.members[0].value = 33.33;
    expense.members[1].value = 66.67;
    expense.description = 'Fictional \\"101.00000000000000001" \\ 1e-999999 "2.0000000000000001"';
    state.groups[0].people[0].name = 'Fictional "7.0000000000000001"\\';
    const raw = JSON.stringify(state).replace('"amountCents"', '"amount\\u0043ents"');
    const store = storage(raw);
    expect(loadStoredState()).toEqual({ state, raw, error: null });
    await expect(saveState(state, raw)).resolves.toBe(JSON.stringify(state));
    expect(store.setItem).toHaveBeenCalledOnce();
  });

  it("preserves externally authored percentages whose fractions round to whole Numbers", async () => {
    const state = fixture();
    const expense = state.groups[0].expenses[0];
    expense.splitType = "percent";
    expense.members[0].value = 50;
    expense.members[1].value = 50;
    const raw = JSON.stringify(state).replace('"value":50', '"value":50.00000000000000001');
    const store = storage(raw);
    expect(loadStoredState().error).toMatch(/unsupported fractional precision/);
    await expect(saveState(state, raw)).rejects.toThrow(/unsupported fractional precision/);
    expect(store.bytes()).toBe(raw);
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it("keeps existing schema checks for nonintegral cents and nonfinite exponents", async () => {
    for (const token of ["101.1", `1e+${"9".repeat(6_000)}`]) {
      const raw = replaceToken("amountCents", token);
      const store = storage(raw);
      expect(loadStoredState().error).toMatch(/invalid or unrecognized/);
      await expect(saveState(fixture(), raw)).rejects.toThrow(/invalid or unrecognized/);
      expect(store.bytes()).toBe(raw);
      expect(store.setItem).not.toHaveBeenCalled();
    }
  });

  it("validates JSON syntax before checking source precision", async () => {
    const raw = `${replaceToken("amountCents", "101.00000000000000001")},`;
    const store = storage(raw);
    const loaded = loadStoredState();
    expect(loaded).toEqual({ state: emptyState(), raw, error: expect.any(String) });
    expect(loaded.error).not.toMatch(/fractional precision/);
    await expect(saveState(fixture(), raw)).rejects.toThrow(SyntaxError);
    expect(store.bytes()).toBe(raw);
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it("leaves valid alternate tokens intact after a failed write and allows retry", async () => {
    const raw = replaceToken("amountCents", "1.0100E+2");
    const store = storage(raw);
    store.failWrites(true);
    await expect(saveState(fixture(), raw)).rejects.toThrow("fictional quota");
    expect(store.bytes()).toBe(raw);
    expect(loadStoredState()).toEqual({ state: fixture(), raw, error: null });
    store.failWrites(false);
    const canonical = JSON.stringify(fixture());
    await expect(saveState(fixture(), raw)).resolves.toBe(canonical);
    expect(store.bytes()).toBe(canonical);
    expect(store.setItem).toHaveBeenCalledTimes(2);
  });
});
