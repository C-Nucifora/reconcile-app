import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../types";
import { emptyState, loadStoredState, saveState, STORAGE_KEY } from "./storage";

type Field = "cents" | "weight" | "percent";
type Layout = "escaped" | "unicode";
const layouts: Layout[] = ["escaped", "unicode"];
const fields: Field[] = ["cents", "weight", "percent"];
const precisionError = /unsupported fractional precision.*preserved/;
const schemaError = /invalid or unrecognized records.*preserved/;

// Exact rational arithmetic, deliberately independent of trailing-zero counting.
function rational(token: string): { numerator: bigint; denominator: bigint } {
  if (token.length > 40) throw new Error("Oracle token budget exceeded");
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  if (!match) throw new Error("Oracle requires a valid JSON number");
  const [, sign, whole, fraction = "", exponentText = "0"] = match;
  const exponent = Number(exponentText);
  if (Math.abs(exponent) > 324) throw new Error("Oracle exponent budget exceeded");
  let numerator = BigInt(whole + fraction) * (sign === "-" ? -1n : 1n);
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator *= 10n ** BigInt(-exponent);
  return { numerator, denominator };
}

function fixture(field: Field): AppState {
  const decoys = Array.from({ length: 4 }, (_, n) =>
    `${"\\".repeat(n)}"2.5000000000000001e+1" -2e-324`,
  ).join(" | ");
  return {
    groups: [{
      id: "fictional-oracle", name: `Fictional ${decoys}\\`,
      people: [{ id: "a", name: "Fictional Aspen" }, { id: "b", name: "Fictional Beech" }],
      expenses: [{
        id: "fictional-oracle-expense", description: `Fictional ${decoys}\\`,
        amountCents: 23, payerId: "a", date: "2026-11-12",
        splitType: field === "percent" ? "percent" : "equal",
        members: [{ personId: "a", value: 23 }, { personId: "b", value: 77 }],
        receiptImageId: `fictional-after-numbers-${decoys}\\`,
      }],
    }], activeGroupId: "fictional-oracle", schemaVersion: 1,
  };
}

function withValue(base: AppState, field: Field, value: number): AppState {
  const state = JSON.parse(JSON.stringify(base)) as AppState;
  const expense = state.groups[0].expenses[0];
  if (field === "cents") expense.amountCents = value;
  else expense.members[0].value = value;
  return state;
}

function representation(state: AppState, layout: Layout): string {
  let raw = JSON.stringify(state);
  if (layout === "unicode") {
    // Encode complete known string values, without parsing or scanning raw JSON.
    const group = state.groups[0];
    for (const value of [group.name, group.expenses[0].description, group.expenses[0].receiptImageId!]) {
      const encoded = Array.from(value, (char) =>
        `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
      ).join("");
      raw = raw.replace(JSON.stringify(value), `"${encoded}"`);
    }
    raw = raw.split('"amountCents"').join('"amount\\u0043ents"')
      .split('"value"').join('"\\u0076alue"');
  }
  raw = `\r\n ${raw}\t`;
  expect(raw.length).toBeLessThan(5_000);
  return raw;
}

function injectToken(raw: string, field: Field, layout: Layout, token: string): string {
  const key = field === "cents"
    ? layout === "unicode" ? '"amount\\u0043ents"' : '"amountCents"'
    : layout === "unicode" ? '"\\u0076alue"' : '"value"';
  const marker = `${key}:23`;
  expect(raw.split(marker)).toHaveLength(2);
  const injected = raw.replace(marker, `${key}:${token}`);
  expect(injected.length).toBeLessThan(5_000);
  return injected;
}

function storage() {
  let raw: string | null = null;
  const setItem = vi.fn((key: string, value: string) => {
    expect(key).toBe(STORAGE_KEY);
    raw = value;
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === STORAGE_KEY ? raw : null, setItem,
  });
  vi.stubGlobal("navigator", { locks: {
    request: async (key: string, callback: () => string) => {
      expect(key).toBe(STORAGE_KEY);
      return callback();
    },
  } });
  return {
    setItem, bytes: () => raw,
    inject: (value: string) => { raw = value; setItem.mockClear(); },
  };
}

async function establish(field: Field, layout: Layout) {
  const base = fixture(field);
  const store = storage();
  const canonical = JSON.stringify(base);
  await expect(saveState(base, null)).resolves.toBe(canonical);
  expect(store.bytes()).toBe(canonical);
  expect(store.setItem).toHaveBeenCalledOnce();
  expect(loadStoredState()).toEqual({ state: base, raw: canonical, error: null });
  const raw = representation(base, layout);
  store.inject(raw);
  expect(loadStoredState()).toEqual({ state: base, raw, error: null });
  expect(store.bytes()).toBe(raw);
  expect(store.setItem).not.toHaveBeenCalled();
  return { base, store, raw };
}

async function accepted(store: ReturnType<typeof storage>, state: AppState, raw: string) {
  // JSON serialization intentionally canonicalizes negative zero.
  const canonical = JSON.stringify(state);
  expect(loadStoredState()).toEqual({ state, raw, error: null });
  expect(store.bytes()).toBe(raw);
  expect(store.setItem).not.toHaveBeenCalled();
  await expect(saveState(state, raw)).resolves.toBe(canonical);
  expect(store.bytes()).toBe(canonical);
  expect(store.setItem).toHaveBeenCalledOnce();
  expect(loadStoredState()).toEqual({ state: JSON.parse(canonical), raw: canonical, error: null });
  await expect(saveState(JSON.parse(canonical) as AppState, canonical)).resolves.toBe(canonical);
  expect(store.bytes()).toBe(canonical);
  expect(store.setItem).toHaveBeenCalledTimes(2);
}

afterEach(() => vi.unstubAllGlobals());

// 2 signs x 6 coefficients x 7 exponents x 3 fields x 2 layouts = 504 cases.
const cases = ["", "-"].flatMap((sign) =>
  ["0", "0.0000", "0.2500", "2500", "2.5000000000000001", "24.999999999999999"].flatMap((coefficient) =>
    ["", "E+000", "e-000", "e+1", "E-002", "e-324", "E+310"].flatMap((exponent) =>
      fields.flatMap((field) => layouts.map((layout) => ({ token: sign + coefficient + exponent, field, layout }))),
    ),
  ),
);

describe("round6 bounded rational storage oracle", () => {
  it.each(cases)("$field $layout $token", async ({ token, field, layout }) => {
    const { base, store, raw: baseline } = await establish(field, layout);
    const { numerator, denominator } = rational(token);
    const value = Number(token);
    const losesFraction = numerator % denominator !== 0n && Number.isInteger(value);
    const schemaAllows = Number.isFinite(value) && value >= 0 &&
      (field !== "cents" || Number.isSafeInteger(value)) &&
      (field !== "percent" || value <= 100);
    const expected = withValue(base, field, value);
    // Prove the rounded Number itself is supported before attributing a refusal to its source.
    if (schemaAllows) {
      const canonicalControl = JSON.stringify(expected);
      store.inject(canonicalControl);
      expect(loadStoredState()).toEqual({ state: JSON.parse(canonicalControl), raw: canonicalControl, error: null });
      expect(store.setItem).not.toHaveBeenCalled();
    }
    const raw = injectToken(baseline, field, layout, token);
    store.inject(raw);
    if (losesFraction || !schemaAllows) {
      const error = losesFraction ? precisionError : schemaError;
      expect(loadStoredState()).toEqual({ state: emptyState(), raw, error: expect.stringMatching(error) });
      // Keep the candidate valid so a candidate-schema error cannot mask the raw-source check.
      await expect(saveState(base, raw)).rejects.toThrow(error);
      expect(store.bytes()).toBe(raw);
      expect(store.setItem).not.toHaveBeenCalled();
    } else {
      await accepted(store, expected, raw);
    }
  });

  // Positive finite binary64 neighbors, not decimal perturbations of the same Number.
  const neighbors = [Number.MIN_VALUE * 2, 1, 100, 2 ** 53, 1e21, Number.MAX_VALUE / 2]
    .flatMap((center) => [-1n, 0n, 1n].map((offset) => {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, center);
      view.setBigUint64(0, view.getBigUint64(0) + offset);
      return view.getFloat64(0);
    }));

  it.each(neighbors.flatMap((value) => layouts.map((layout) => ({ value, layout }))))(
    "roundtrips serialized neighbor $value in $layout", async ({ value, layout }) => {
      expect(Number.isFinite(value) && value > 0).toBe(true);
      const { base, store } = await establish("weight", layout);
      const state = withValue(base, "weight", value);
      const raw = representation(state, layout);
      store.inject(raw);
      await accepted(store, state, raw);
    },
  );

  it.each(["+25", "025", "25.", ".25", "25e", "25e+-1", "--25", "NaN"]
    .flatMap((token) => layouts.map((layout) => ({ token, layout }))))(
    "rejects syntax before precision for $token in $layout", async ({ token, layout }) => {
      const { base, store, raw: baseline } = await establish("weight", layout);
      const precise = injectToken(baseline, "cents", layout, "2.5000000000000001e+1");
      const raw = injectToken(precise, "weight", layout, token);
      store.inject(raw);
      expect(() => JSON.parse(raw)).toThrow(SyntaxError);
      const loaded = loadStoredState();
      expect(loaded).toEqual({ state: emptyState(), raw, error: expect.any(String) });
      expect(loaded.error).not.toMatch(/fractional precision|invalid or unrecognized records/);
      await expect(saveState(base, raw)).rejects.toThrow(SyntaxError);
      expect(store.bytes()).toBe(raw);
      expect(store.setItem).not.toHaveBeenCalled();
    },
  );
});
