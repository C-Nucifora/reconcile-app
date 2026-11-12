import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../types";
import { parseAmountToCents } from "../engine/money";
import { buildReport } from "../export/report";
import { reducer } from "./reducer";
import { emptyState, loadStoredState, saveState, STORAGE_KEY, validateState } from "./storage";

function fixture(): AppState {
  return {
    groups: [{
      id: "fictional-group", name: "Fictional <island>\nCafe\u0301",
      people: [{ id: "a", name: "Fictional Aster" }, { id: "b", name: "Fictional Cafe\u0301" }],
      expenses: [{
        id: "fictional-ferry", description: "Fictional <ferry>\t\"ticket\"", amountCents: 101,
        payerId: "a", date: "2026-11-12", splitType: "exact",
        members: [{ personId: "a", value: 51 }, { personId: "b", value: 50 }],
        receiptImageId: "fictional-receipt",
      }, {
        id: "fictional-picnic", description: "Fictional picnic", amountCents: 7,
        payerId: "a", date: "2026-11-12", splitType: "equal", members: [],
        items: [
          { id: "fictional-assigned", name: "Fictional Cafe\u0301\nitem", amountCents: 3, assigneeIds: ["a"] },
          { id: "fictional-pending", name: "Fictional pending", amountCents: 4, assigneeIds: [] },
        ],
      }],
    }], activeGroupId: "fictional-group", schemaVersion: 1,
  };
}

function storage(initial: string | null) {
  let raw = initial;
  const setItem = vi.fn((key: string, value: string) => {
    expect(key).toBe(STORAGE_KEY);
    raw = value;
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === STORAGE_KEY ? raw : null, setItem,
  });
  vi.stubGlobal("navigator", { locks: {
    request: async (_name: string, callback: () => string) => callback(),
  } });
  return { bytes: () => raw, setItem };
}

afterEach(() => vi.unstubAllGlobals());

const mutations: Array<[string, (state: AppState) => void]> = [
  ["unknown person leaf", (state) => { Object.assign(state.groups[0].people[0], { futureName: "retain me" }); }],
  ["unknown member leaf", (state) => { Object.assign(state.groups[0].expenses[0].members[0], { futureCents: 2 }); }],
  ["unknown item leaf", (state) => { Object.assign(state.groups[0].expenses[1].items![0], { taxCents: 2 }); }],
  ["own prototype-named leaf", (state) => {
    Object.defineProperty(state.groups[0].expenses[1].items![0], "__proto__", {
      value: { name: "retain me" }, enumerable: true,
    });
  }],
  ["empty receipt reference", (state) => { state.groups[0].expenses[0].receiptImageId = ""; }],
  ["non-string receipt reference", (state) => { Object.assign(state.groups[0].expenses[0], { receiptImageId: 17 }); }],
  ["non-string item name", (state) => { Object.assign(state.groups[0].expenses[1].items![0], { name: null }); }],
  ["duplicate item assignee", (state) => { state.groups[0].expenses[1].items![0].assigneeIds.push("a"); }],
  ["duplicate pending item", (state) => { state.groups[0].expenses[1].items!.push({ ...state.groups[0].expenses[1].items![1] }); }],
  ["missing pending assignee list", (state) => { Reflect.deleteProperty(state.groups[0].expenses[1].items![1], "assigneeIds"); }],
  ["itemized split members", (state) => { state.groups[0].expenses[1].members.push({ personId: "a", value: 0 }); }],
  ["empty non-itemized items", (state) => { state.groups[0].expenses[0].items = []; }],
];

describe("round5 nested persisted leaves", () => {
  it.each(mutations)("rejects %s without changing either the good snapshot or damaged bytes", async (_name, mutate) => {
    const valid = fixture();
    const damaged = fixture();
    mutate(damaged);
    // JSON round-trip keeps this on the actual persistence boundary, including own __proto__ keys.
    const raw = `\n${JSON.stringify(damaged, null, 2)}\t`;
    const candidate = JSON.parse(raw) as AppState;
    expect(() => validateState(candidate)).toThrow();
    expect(reducer(valid, { type: "IMPORT_STATE", state: candidate })).toBe(valid);

    const goodBytes = JSON.stringify(valid);
    const goodStore = storage(goodBytes);
    await expect(saveState(candidate, goodBytes)).rejects.toThrow();
    expect(goodStore.bytes()).toBe(goodBytes);
    expect(goodStore.setItem).not.toHaveBeenCalled();
    await expect(saveState(valid, goodBytes)).resolves.toBe(goodBytes);

    const damagedStore = storage(raw);
    expect(loadStoredState()).toEqual({ state: emptyState(), raw, error: expect.any(String) });
    await expect(saveState(valid, raw)).rejects.toThrow();
    expect(damagedStore.bytes()).toBe(raw);
    expect(damagedStore.setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(candidate, null, 2)).toBe(raw.trim());
  });
});

describe("round5 raw JSON money tokens", () => {
  it.each([
    ["expense cents", '"amountCents":101', '"amountCents":101.00000000000000001'],
    ["item cents", '"amountCents":3', '"amountCents":3.0000000000000001'],
    ["exact member cents", '"value":51', '"value":51.00000000000000001'],
  ])("refuses fractional %s before binary rounding can erase the fraction", async (_name, original, replacement) => {
    const canonical = JSON.stringify(fixture());
    expect(canonical.split(original)).toHaveLength(2);
    const raw = canonical.replace(original, replacement);
    const store = storage(raw);
    const loaded = loadStoredState();
    const outcome = await saveState(fixture(), raw).then(() => "saved", () => "rejected");
    expect.soft(loaded).toEqual({ state: emptyState(), raw, error: expect.any(String) });
    expect.soft(outcome).toBe("rejected");
    expect.soft(store.bytes()).toBe(raw);
    expect.soft(store.setItem).not.toHaveBeenCalled();
  });
});

describe("round5 accepted text and identity across money storage and reports", () => {
  it.each([
    { id: "constructor", money: "$+1.01", rejected: "$+1.010" },
    { id: "toString", money: "\u00a0£1.01\u00a0", rejected: "£1.\u200b01" },
    { id: "__proto__", money: "0001.01", rejected: "０００１.０１" },
    { id: "fictional\u0000person", money: "1.01", rejected: "1\u2028.01" },
  ])("retains $id identities and literal text through an accepted $money amount", async ({ id, money, rejected }) => {
    expect(parseAmountToCents(money)).toBe(101);
    expect(parseAmountToCents(rejected)).toBeNull();
    const state = fixture();
    const group = state.groups[0];
    group.people[0].id = id;
    group.expenses[0].amountCents = parseAmountToCents(money)!;
    for (const expense of group.expenses) {
      expense.payerId = id;
      for (const member of expense.members) if (member.personId === "a") member.personId = id;
      for (const item of expense.items ?? []) item.assigneeIds = item.assigneeIds.map((personId) => personId === "a" ? id : personId);
    }
    const before = structuredClone(state);
    expect(validateState(state)).toEqual(before);
    storage(null);
    const raw = await saveState(state, null);
    const loaded = loadStoredState();
    expect(loaded).toEqual({ state: before, raw, error: null });
    const report = buildReport(loaded.state.groups[0], {
      sections: { settleUp: true, expenses: true, perPerson: true }, generatedDate: "2026-11-12",
    });
    expect(report.header).toEqual({ groupName: "Fictional <island>\nCafe\u0301", generatedDate: "2026-11-12" });
    expect(report.expenses).toEqual([
      {
        description: "Fictional <ferry>\t\"ticket\"", date: "2026-11-12", payerName: "Fictional Aster",
        amountCents: 101, pendingCents: 0, splitSummary: "Exact amounts", items: undefined,
      }, {
        description: "Fictional picnic", date: "2026-11-12", payerName: "Fictional Aster",
        amountCents: 7, pendingCents: 4, splitSummary: "Itemised", items: [
          { name: "Fictional Cafe\u0301\nitem", cents: 3, assigneeNames: ["Fictional Aster"] },
          { name: "Fictional pending", cents: 4, assigneeNames: [] },
        ],
      },
    ]);
    expect(report.perPerson).toEqual([
      { name: "Fictional Aster", paidCents: 104, owedCents: 54, netCents: 50, contributions: [
        { description: "Fictional <ferry>\t\"ticket\"", owedCents: 51 },
        { description: "Fictional picnic", owedCents: 3 },
      ] },
      { name: "Fictional Cafe\u0301", paidCents: 0, owedCents: 50, netCents: -50, contributions: [
        { description: "Fictional <ferry>\t\"ticket\"", owedCents: 50 },
      ] },
    ]);
    expect(report.settleUp).toEqual({
      netBalances: [{ name: "Fictional Aster", cents: 50 }, { name: "Fictional Cafe\u0301", cents: -50 }],
      transfers: [{ from: "Fictional Cafe\u0301", to: "Fictional Aster", cents: 50 }],
    });
    expect(state).toEqual(before);
    expect(loadStoredState()).toEqual(loaded);
  });
});
