import { describe, it, expect } from "vitest";
import {
  computeExpenseShares,
  computeBalances,
  payerCredit,
  pendingCents,
  expenseTotalCents,
} from "./balances";
import type { Expense, ExpenseItem, Group } from "../types";

function item(partial: Partial<ExpenseItem> & Pick<ExpenseItem, "amountCents" | "assigneeIds">): ExpenseItem {
  return {
    id: partial.id ?? "i1",
    name: partial.name ?? "item",
    ...partial,
  };
}

function expense(partial: Partial<Expense> & Pick<Expense, "amountCents" | "payerId" | "splitType" | "members">): Expense {
  return {
    id: partial.id ?? "e1",
    description: partial.description ?? "",
    date: partial.date ?? "2026-01-01",
    ...partial,
  };
}

describe("computeExpenseShares", () => {
  it("splits an equal expense evenly", () => {
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "equal",
      members: [
        { personId: "A", value: 0 },
        { personId: "B", value: 0 },
      ],
    });
    const shares = computeExpenseShares(e);
    expect(shares.get("A")).toBe(500);
    expect(shares.get("B")).toBe(500);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("splits an equal three-way expense with largest remainder", () => {
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "equal",
      members: [
        { personId: "A", value: 0 },
        { personId: "B", value: 0 },
        { personId: "C", value: 0 },
      ],
    });
    const shares = computeExpenseShares(e);
    const vals = [shares.get("A"), shares.get("B"), shares.get("C")] as number[];
    expect(vals.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });

  it("uses raw values for an exact split that already sums to the total", () => {
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "exact",
      members: [
        { personId: "A", value: 700 },
        { personId: "B", value: 300 },
      ],
    });
    const shares = computeExpenseShares(e);
    expect(shares.get("A")).toBe(700);
    expect(shares.get("B")).toBe(300);
  });

  it("reconciles an exact split whose values undershoot the total", () => {
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "exact",
      members: [
        { personId: "A", value: 300 },
        { personId: "B", value: 300 },
      ],
    });
    const shares = computeExpenseShares(e);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("reconciles an exact split whose values overshoot the total", () => {
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "exact",
      members: [
        { personId: "A", value: 800 },
        { personId: "B", value: 800 },
      ],
    });
    const shares = computeExpenseShares(e);
    const total = [...shares.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
    expect((shares.get("A") ?? 0) >= 0).toBe(true);
    expect((shares.get("B") ?? 0) >= 0).toBe(true);
  });

  it("reconciles fractional exact values to the exact total", () => {
    // 500.7 and 500.3 truncate to 500/500 = 1000, but amount is 1001.
    const e = expense({
      amountCents: 1001,
      payerId: "A",
      splitType: "exact",
      members: [
        { personId: "A", value: 500.7 },
        { personId: "B", value: 500.3 },
      ],
    });
    const shares = computeExpenseShares(e);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1001);
    // The extra cent goes to the larger fractional remainder (A: .7 > B: .3).
    expect(shares.get("A")).toBe(501);
    expect(shares.get("B")).toBe(500);
  });

  it("splits a percent expense", () => {
    const e = expense({
      amountCents: 100,
      payerId: "A",
      splitType: "percent",
      members: [
        { personId: "A", value: 50 },
        { personId: "B", value: 50 },
      ],
    });
    const shares = computeExpenseShares(e);
    expect(shares.get("A")).toBe(50);
    expect(shares.get("B")).toBe(50);
  });

  it("splits a shares expense 1000 over [1,1,2]", () => {
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "shares",
      members: [
        { personId: "A", value: 1 },
        { personId: "B", value: 1 },
        { personId: "C", value: 2 },
      ],
    });
    const shares = computeExpenseShares(e);
    expect(shares.get("A")).toBe(250);
    expect(shares.get("B")).toBe(250);
    expect(shares.get("C")).toBe(500);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("computeBalances", () => {
  it("includes every person defaulting to 0 when there are no expenses", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [],
    };
    const balances = computeBalances(group);
    expect(balances.get("A")).toBe(0);
    expect(balances.get("B")).toBe(0);
  });

  it("computes the canonical two-expense cancel-out", () => {
    // A pays 1000 split equally between A and B.
    // B pays 3000 split equally between A and B.
    // Net A = -1000 (owes), Net B = +1000.
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "first",
          amountCents: 1000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [
            { personId: "A", value: 0 },
            { personId: "B", value: 0 },
          ],
        },
        {
          id: "e2",
          description: "second",
          amountCents: 3000,
          payerId: "B",
          date: "2026-01-02",
          splitType: "equal",
          members: [
            { personId: "A", value: 0 },
            { personId: "B", value: 0 },
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    expect(balances.get("A")).toBe(-1000);
    expect(balances.get("B")).toBe(1000);
  });

  it("always has nets summing to exactly 0 (property over a fixed example)", () => {
    const group: Group = {
      id: "g",
      name: "trip",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
        { id: "D", name: "D" },
      ],
      expenses: [
        {
          id: "e1",
          description: "dinner",
          amountCents: 10000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [
            { personId: "A", value: 0 },
            { personId: "B", value: 0 },
            { personId: "C", value: 0 },
            { personId: "D", value: 0 },
          ],
        },
        {
          id: "e2",
          description: "taxi",
          amountCents: 3333,
          payerId: "B",
          date: "2026-01-02",
          splitType: "shares",
          members: [
            { personId: "A", value: 1 },
            { personId: "C", value: 2 },
          ],
        },
        {
          id: "e3",
          description: "hotel",
          amountCents: 50001,
          payerId: "C",
          date: "2026-01-03",
          splitType: "percent",
          members: [
            { personId: "A", value: 33 },
            { personId: "B", value: 33 },
            { personId: "C", value: 34 },
          ],
        },
        {
          id: "e4",
          description: "snacks",
          amountCents: 777,
          payerId: "D",
          date: "2026-01-04",
          splitType: "exact",
          members: [
            { personId: "A", value: 200 },
            { personId: "B", value: 277 },
            { personId: "D", value: 300 },
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    expect(balances.size).toBe(4);
    const total = [...balances.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("nets to zero even when an exact split does not sum to the total", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "broken exact",
          amountCents: 1000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "exact",
          members: [
            { personId: "A", value: 300 },
            { personId: "B", value: 300 },
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    const total = [...balances.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
});

describe("computeExpenseShares — itemized", () => {
  it("ignores members and splits each assigned item equally among its assignees", () => {
    const e = expense({
      amountCents: 3000,
      payerId: "A",
      splitType: "equal",
      members: [{ personId: "Z", value: 999 }], // must be ignored when items present
      items: [
        item({ id: "i1", name: "burger", amountCents: 1000, assigneeIds: ["A"] }),
        item({ id: "i2", name: "pizza", amountCents: 2000, assigneeIds: ["A", "B"] }),
      ],
    });
    const shares = computeExpenseShares(e);
    // A: whole burger (1000) + half pizza (1000) = 2000; B: half pizza = 1000.
    expect(shares.get("A")).toBe(2000);
    expect(shares.get("B")).toBe(1000);
    expect(shares.get("Z")).toBeUndefined();
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(3000);
  });

  it("excludes unassigned items but keeps assigned ones (mixed)", () => {
    const e = expense({
      amountCents: 3000,
      payerId: "A",
      splitType: "equal",
      members: [],
      items: [
        item({ id: "i1", name: "assigned", amountCents: 1000, assigneeIds: ["A", "B"] }),
        item({ id: "i2", name: "pending", amountCents: 2000, assigneeIds: [] }),
      ],
    });
    const shares = computeExpenseShares(e);
    // Only the assigned 1000 is split; the pending 2000 contributes nothing.
    expect(shares.get("A")).toBe(500);
    expect(shares.get("B")).toBe(500);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("contributes nothing when every item is pending", () => {
    const e = expense({
      amountCents: 1500,
      payerId: "A",
      splitType: "equal",
      members: [],
      items: [
        item({ id: "i1", amountCents: 1000, assigneeIds: [] }),
        item({ id: "i2", amountCents: 500, assigneeIds: [] }),
      ],
    });
    const shares = computeExpenseShares(e);
    expect(shares.size).toBe(0);
  });

  it("splits an indivisible per-item price exactly among assignees", () => {
    // 1000 over 3 people = 334/333/333 (largest-remainder), summing to 1000.
    const e = expense({
      amountCents: 1000,
      payerId: "A",
      splitType: "equal",
      members: [],
      items: [item({ id: "i1", amountCents: 1000, assigneeIds: ["A", "B", "C"] })],
    });
    const shares = computeExpenseShares(e);
    const vals = [shares.get("A"), shares.get("B"), shares.get("C")] as number[];
    expect(vals.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });

  it("splits a shared item equally across multiple assignees", () => {
    const e = expense({
      amountCents: 1200,
      payerId: "A",
      splitType: "equal",
      members: [],
      items: [item({ id: "i1", amountCents: 1200, assigneeIds: ["A", "B", "C", "D"] })],
    });
    const shares = computeExpenseShares(e);
    expect(shares.get("A")).toBe(300);
    expect(shares.get("B")).toBe(300);
    expect(shares.get("C")).toBe(300);
    expect(shares.get("D")).toBe(300);
  });
});

describe("payerCredit / pendingCents / expenseTotalCents", () => {
  it("returns amountCents for a normal expense and 0 pending", () => {
    const e = expense({
      amountCents: 2500,
      payerId: "A",
      splitType: "equal",
      members: [
        { personId: "A", value: 0 },
        { personId: "B", value: 0 },
      ],
    });
    expect(payerCredit(e)).toBe(2500);
    expect(pendingCents(e)).toBe(0);
    expect(expenseTotalCents(e)).toBe(2500);
  });

  it("returns the allocated total as payer credit for an itemized expense", () => {
    const e = expense({
      amountCents: 3000,
      payerId: "A",
      splitType: "equal",
      members: [],
      items: [
        item({ id: "i1", amountCents: 1000, assigneeIds: ["A", "B"] }),
        item({ id: "i2", amountCents: 2000, assigneeIds: [] }),
      ],
    });
    // Allocated total is just the assigned 1000.
    expect(payerCredit(e)).toBe(1000);
    // Pending is the unassigned 2000.
    expect(pendingCents(e)).toBe(2000);
    // Total is the sum of all items.
    expect(expenseTotalCents(e)).toBe(3000);
  });

  it("treats a fully-assigned itemized expense as fully credited and zero pending", () => {
    const e = expense({
      amountCents: 1800,
      payerId: "A",
      splitType: "equal",
      members: [],
      items: [
        item({ id: "i1", amountCents: 1000, assigneeIds: ["A"] }),
        item({ id: "i2", amountCents: 800, assigneeIds: ["A", "B"] }),
      ],
    });
    expect(payerCredit(e)).toBe(1800);
    expect(pendingCents(e)).toBe(0);
    expect(expenseTotalCents(e)).toBe(1800);
  });
});

describe("computeBalances — itemized", () => {
  it("nets to zero with the payer credited the allocated total (all assigned)", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
      ],
      expenses: [
        {
          id: "e1",
          description: "dinner",
          amountCents: 3000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [],
          items: [
            item({ id: "i1", name: "starter", amountCents: 1000, assigneeIds: ["A", "B", "C"] }),
            item({ id: "i2", name: "main", amountCents: 2000, assigneeIds: ["B", "C"] }),
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    // Allocated total 3000 -> A credited 3000.
    // Debits: starter 1000/3 = 334/333/333; main 2000/2 = 1000/1000.
    // A net = +3000 - 334 = +2666.
    // B net = -(333 + 1000) = -1333. C net = -(333 + 1000) = -1333.
    expect(balances.get("A")).toBe(2666);
    expect(balances.get("B")).toBe(-1333);
    expect(balances.get("C")).toBe(-1333);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("excludes unassigned items and still nets to zero (mixed)", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "groceries",
          amountCents: 5000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [],
          items: [
            item({ id: "i1", name: "shared", amountCents: 1000, assigneeIds: ["A", "B"] }),
            item({ id: "i2", name: "tbd", amountCents: 4000, assigneeIds: [] }),
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    // Only the 1000 shared item is allocated: A credited 1000, both owe 500.
    // A net = +1000 - 500 = +500; B net = -500.
    expect(balances.get("A")).toBe(500);
    expect(balances.get("B")).toBe(-500);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("contributes nothing when every item is pending", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "all pending",
          amountCents: 4000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [],
          items: [
            item({ id: "i1", amountCents: 1500, assigneeIds: [] }),
            item({ id: "i2", amountCents: 2500, assigneeIds: [] }),
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    expect(balances.get("A")).toBe(0);
    expect(balances.get("B")).toBe(0);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("mixes itemized and normal expenses and still nets to zero", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
      ],
      expenses: [
        {
          id: "e1",
          description: "normal",
          amountCents: 999,
          payerId: "B",
          date: "2026-01-01",
          splitType: "equal",
          members: [
            { personId: "A", value: 0 },
            { personId: "B", value: 0 },
            { personId: "C", value: 0 },
          ],
        },
        {
          id: "e2",
          description: "itemized",
          amountCents: 1001,
          payerId: "C",
          date: "2026-01-02",
          splitType: "equal",
          members: [],
          items: [
            item({ id: "i1", amountCents: 701, assigneeIds: ["A", "C"] }),
            item({ id: "i2", amountCents: 300, assigneeIds: [] }), // pending
          ],
        },
      ],
    };
    const balances = computeBalances(group);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("expense boundary regressions", () => {
  const base: Expense = { id: "e", description: "", date: "2026-01-01", amountCents: 100, payerId: "A", splitType: "equal", members: [{ personId: "B", value: 1 }] };
  const group = (expenses: Expense[]): Group => ({ id: "g", name: "", people: [{ id: "A", name: "A" }, { id: "B", name: "B" }], expenses });

  it("breaks equal decimal exact remainders by member order", () => {
    const exact = (amountCents: number, values: number[]) => computeExpenseShares({
      ...base, amountCents, splitType: "exact",
      members: values.map((value, index) => ({ personId: String(index), value })),
    });
    expect([...exact(2, [0.1, 1.1]).values()]).toEqual([1, 1]);
    expect([...exact(3, [2.1, 2.1]).values()]).toEqual([2, 1]);
    expect([...exact(5, [4.1, 2.1]).values()]).toEqual([4, 1]);
    expect([...exact(2, [0.0000001, 1.0000001]).values()]).toEqual([1, 1]);
    expect([...exact(1, [Number.MIN_VALUE, 0]).values()]).toEqual([1, 0]);
  });

  it("does not credit a payer when no one is allocated the expense", () => {
    const empty = { ...base, members: [] };
    expect(payerCredit(empty)).toBe(0);
    expect([...computeBalances(group([empty])).values()]).toEqual([0, 0]);
  });

  it("repairs huge exact discrepancies without one operation per cent", () => {
    const large = { ...base, splitType: "exact" as const, amountCents: Number.MAX_SAFE_INTEGER, members: [{ personId: "A", value: 0 }, { personId: "B", value: 0 }] };
    expect([...computeExpenseShares(large).values()]).toEqual([4503599627370496, 4503599627370495]);
    expect([...computeExpenseShares({ ...large, amountCents: 1, members: large.members.map((member) => ({ ...member, value: Number.MAX_SAFE_INTEGER })) }).values()]).toEqual([1, 0]);
  });

  it("counts repeated item assignees only once", () => {
    expect([...computeExpenseShares({ ...base, items: [item({ amountCents: 100, assigneeIds: ["A", "A", "B"] })] }).values()]).toEqual([50, 50]);
  });

  it("rejects negative, fractional, nonfinite and unsafe expense cents", () => {
    for (const amountCents of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => computeExpenseShares({ ...base, amountCents })).toThrow(RangeError);
    }
    for (const value of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => computeExpenseShares({ ...base, splitType: "exact", members: [{ personId: "A", value }] })).toThrow(RangeError);
    }
  });

  it("rejects unknown people and duplicate split members", () => {
    expect(() => computeBalances(group([{ ...base, payerId: "missing" }]))).toThrow(RangeError);
    expect(() => computeBalances(group([{ ...base, members: [{ personId: "missing", value: 1 }] }]))).toThrow(RangeError);
    expect(() => computeExpenseShares({ ...base, members: [...base.members, ...base.members] })).toThrow(RangeError);
  });

  it("checks aggregate cents and accumulates offsetting expenses exactly", () => {
    const large = { ...base, amountCents: Number.MAX_SAFE_INTEGER };
    expect(() => computeBalances(group([large, base]))).toThrow(RangeError);
    const reversed = { ...large, payerId: "B", members: [{ personId: "A", value: 1 }] };
    expect([...computeBalances(group([large, base, reversed])).values()]).toEqual([100, -100]);
    expect(() => expenseTotalCents({ ...base, items: [item({ amountCents: Number.MAX_SAFE_INTEGER, assigneeIds: [] }), item({ amountCents: 1, assigneeIds: [] })] })).toThrow(RangeError);
  });

  it.each(["equal", "exact", "percent", "shares"] as const)("conserves zero and maximum totals for %s, with and without the payer included", (splitType) => {
    for (const amountCents of [0, 1, Number.MAX_SAFE_INTEGER]) {
      for (const ids of [["A", "B"], ["B"]]) {
        const e = { ...base, splitType, amountCents, members: ids.map((personId) => ({ personId, value: 0 })) };
        const original = structuredClone(e);
        const shares = [...computeExpenseShares(e).values()];
        expect(shares.every((share) => Number.isSafeInteger(share) && share >= 0)).toBe(true);
        expect(shares.reduce((sum, share) => sum + BigInt(share), 0n)).toBe(BigInt(amountCents));
        expect(payerCredit(e)).toBe(amountCents);
        expect([...computeBalances(group([e])).values()].reduce((sum, net) => sum + BigInt(net), 0n)).toBe(0n);
        expect(e).toEqual(original);
      }
    }
  });

  it.each(["percent", "shares"] as const)("validates %s weights even for a zero total", (splitType) => {
    for (const value of [-1, NaN, Infinity, -Infinity]) {
      expect(() => computeExpenseShares({ ...base, splitType, amountCents: 0, members: [{ personId: "B", value }] })).toThrow(RangeError);
    }
    const huge = { ...base, splitType, members: ["A", "B"].map((personId) => ({ personId, value: Number.MAX_VALUE })) };
    expect([...computeExpenseShares(huge).values()]).toEqual([50, 50]);
  });

  it("rejects invalid item amounts whether assigned or pending", () => {
    for (const amountCents of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      for (const assigneeIds of [[], ["B"]]) {
        const e = { ...base, items: [item({ amountCents, assigneeIds })] };
        expect(() => computeExpenseShares(e)).toThrow(RangeError);
        expect(() => expenseTotalCents(e)).toThrow(RangeError);
        expect(() => payerCredit(e)).toThrow(RangeError);
        if (assigneeIds.length === 0) expect(() => pendingCents(e)).toThrow(RangeError);
      }
    }
  });

  it("conserves maximum item totals, including duplicate assignees and pending cents", () => {
    const e = { ...base, items: [
      item({ id: "shared", amountCents: Number.MAX_SAFE_INTEGER - 1, assigneeIds: ["B", "A", "B"] }),
      item({ id: "pending", amountCents: 1, assigneeIds: [] }),
      item({ id: "zero", amountCents: 0, assigneeIds: ["B"] }),
    ] };
    expect([...computeExpenseShares(e)]).toEqual([["B", 4503599627370495], ["A", 4503599627370495]]);
    expect(expenseTotalCents(e)).toBe(Number.MAX_SAFE_INTEGER);
    expect(payerCredit(e) + pendingCents(e)).toBe(Number.MAX_SAFE_INTEGER);
    expect([...computeBalances(group([e])).values()]).toEqual([4503599627370495, -4503599627370495]);
    expect(() => computeBalances(group([{ ...e, items: [item({ amountCents: 0, assigneeIds: ["missing"] })] }]))).toThrow(RangeError);
  });
});
