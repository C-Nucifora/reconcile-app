import { describe, it, expect } from "vitest";
import { buildReport } from "./report";
import type { Group } from "../types";

function group(): Group {
  return {
    id: "g1",
    name: "Trip",
    people: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bob" },
    ],
    expenses: [
      {
        id: "e1",
        description: "Dinner",
        amountCents: 2000,
        payerId: "a",
        date: "2026-06-20",
        splitType: "equal",
        members: [
          { personId: "a", value: 0 },
          { personId: "b", value: 0 },
        ],
      },
      {
        id: "e2",
        description: "Snacks",
        amountCents: 1000,
        payerId: "b",
        date: "2026-06-21",
        splitType: "equal",
        members: [],
        items: [
          { id: "i1", name: "Chips", amountCents: 600, assigneeIds: ["a"] },
          { id: "i2", name: "Soda", amountCents: 400, assigneeIds: [] },
        ],
      },
    ],
  };
}

const ALL = { settleUp: true, expenses: true, perPerson: true };

describe("buildReport", () => {
  it("always includes a header with group name and the passed date", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    expect(r.header).toEqual({ groupName: "Trip", generatedDate: "2026-06-23" });
  });

  it("omits sections whose toggle is false", () => {
    const r = buildReport(group(), {
      sections: { settleUp: true, expenses: false, perPerson: false },
      generatedDate: "2026-06-23",
    });
    expect(r.settleUp).toBeDefined();
    expect(r.expenses).toBeUndefined();
    expect(r.perPerson).toBeUndefined();
  });

  it("resolves ids to names in settle-up transfers and net balances", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    // Ann paid 2000, owes 1000 (dinner half) + 600 (chips) = 1600 -> net +400
    // Bob paid 1000 (only assigned items credit = 600), owes 1000 (dinner half) -> net -400
    expect(r.settleUp!.netBalances).toEqual([
      { name: "Ann", cents: 400 },
      { name: "Bob", cents: -400 },
    ]);
    expect(r.settleUp!.transfers).toEqual([
      { from: "Bob", to: "Ann", cents: 400 },
    ]);
  });

  it("lists itemised line items with assignee names and a split summary", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    const snacks = r.expenses!.find((e) => e.description === "Snacks")!;
    expect(snacks.splitSummary).toBe("Itemised");
    expect(snacks.payerName).toBe("Bob");
    expect(snacks.amountCents).toBe(1000);
    expect(snacks.pendingCents).toBe(400);
    expect(snacks.items).toEqual([
      { name: "Chips", cents: 600, assigneeNames: ["Ann"] },
      { name: "Soda", cents: 400, assigneeNames: [] },
    ]);
    const dinner = r.expenses!.find((e) => e.description === "Dinner")!;
    expect(dinner.splitSummary).toBe("Equal among 2");
    expect(dinner.items).toBeUndefined();
  });

  it("computes per-person paid/owed/net and contributions, netting to zero", () => {
    const r = buildReport(group(), { sections: ALL, generatedDate: "2026-06-23" });
    const ann = r.perPerson!.find((p) => p.name === "Ann")!;
    expect(ann).toMatchObject({ paidCents: 2000, owedCents: 1600, netCents: 400 });
    expect(ann.contributions).toEqual([
      { description: "Dinner", owedCents: 1000 },
      { description: "Snacks", owedCents: 600 },
    ]);
    const sum = r.perPerson!.reduce((acc, p) => acc + p.netCents, 0);
    expect(sum).toBe(0);
  });

  it.each([
    { mode: "equal", values: [0, 0], owed: [51, 50] },
    { mode: "exact", values: [30, 71], owed: [30, 71] },
    { mode: "percent", values: [25, 75], owed: [25, 76] },
    { mode: "shares", values: [1, 2], owed: [34, 67] },
  ] as const)("keeps integer-cent totals consistent for $mode splits", ({ mode, values, owed }) => {
    const g = group();
    g.expenses = [{
      ...g.expenses[0], amountCents: 101, splitType: mode,
      members: [{ personId: "a", value: values[0] }, { personId: "b", value: values[1] }],
    }];
    const r = buildReport(g, { sections: ALL, generatedDate: "2026-11-12" });
    expect(r.expenses![0]).toMatchObject({ amountCents: 101, pendingCents: 0 });
    expect(r.perPerson!.map((person) => person.owedCents)).toEqual(owed);
    expect(r.perPerson!.map((person) => person.paidCents)).toEqual([101, 0]);
    expect(r.settleUp!.netBalances.map((balance) => balance.cents)).toEqual([owed[1], -owed[1]]);
    expect(r.settleUp!.transfers).toEqual([{ from: "Bob", to: "Ann", cents: owed[1] }]);
  });

  it("respects all section combinations without changing input or exporting receipt identifiers", () => {
    const g = group();
    g.expenses[0].receiptImageId = "fictional-private-receipt-id";
    const before = structuredClone(g);
    for (let mask = 0; mask < 8; mask++) {
      const sections = { settleUp: Boolean(mask & 1), expenses: Boolean(mask & 2), perPerson: Boolean(mask & 4) };
      const r = buildReport(g, { sections, generatedDate: "2026-11-12" });
      for (const section of ["settleUp", "expenses", "perPerson"] as const) {
        expect(r[section] !== undefined).toBe(sections[section]);
      }
      expect(JSON.stringify(r)).not.toContain("fictional-private-receipt-id");
    }
    expect(g).toEqual(before);
  });

  it("exports an empty group and fully pending items without creating debt", () => {
    const g = group();
    g.expenses = [g.expenses[1]];
    g.expenses[0].items![0].assigneeIds = [];
    const r = buildReport(g, { sections: ALL, generatedDate: "2026-11-12" });
    expect(r.expenses![0]).toMatchObject({ amountCents: 1000, pendingCents: 1000 });
    expect(r.settleUp!.transfers).toEqual([]);
    expect(r.perPerson!.map((person) => person.netCents)).toEqual([0, 0]);
    expect(buildReport({ ...g, people: [], expenses: [] }, { sections: ALL, generatedDate: "2026-11-12" }))
      .toMatchObject({ settleUp: { transfers: [], netBalances: [] }, expenses: [], perPerson: [] });
  });
});
