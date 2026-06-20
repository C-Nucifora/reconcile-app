import { describe, it, expect } from "vitest";
import { computeExpenseShares, computeBalances } from "./balances";
import type { Expense, Group } from "../types";

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
