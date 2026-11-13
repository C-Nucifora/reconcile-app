import { describe, it, expect } from "vitest";
import { settle } from "./settle";
import type { ID, Transfer } from "../types";

function applyTransfers(balances: Map<ID, number>, transfers: Transfer[]): Map<ID, number> {
  const result = new Map(balances);
  for (const t of transfers) {
    result.set(t.fromId, (result.get(t.fromId) ?? 0) + t.amountCents);
    result.set(t.toId, (result.get(t.toId) ?? 0) - t.amountCents);
  }
  return result;
}

describe("settle", () => {
  it("produces a single transfer for the canonical cancel-out", () => {
    const balances = new Map<ID, number>([
      ["A", -1000],
      ["B", 1000],
    ]);
    const transfers = settle(balances);
    expect(transfers).toEqual([{ fromId: "A", toId: "B", amountCents: 1000 }]);
  });

  it("returns no transfers when everyone is settled", () => {
    const balances = new Map<ID, number>([
      ["A", 0],
      ["B", 0],
    ]);
    expect(settle(balances)).toEqual([]);
  });

  it("rejects sub-cent residuals", () => {
    expect(() => settle(new Map([["A", 0.1], ["B", -0.1]]))).toThrow(RangeError);
  });

  it("never emits a self-transfer", () => {
    const balances = new Map<ID, number>([
      ["A", -500],
      ["B", 500],
    ]);
    const transfers = settle(balances);
    for (const t of transfers) {
      expect(t.fromId).not.toBe(t.toId);
    }
  });

  it("settles a 4-person example with <= n-1 transfers, zeroing everyone", () => {
    const balances = new Map<ID, number>([
      ["A", -700],
      ["B", -300],
      ["C", 500],
      ["D", 500],
    ]);
    const n = balances.size;
    const transfers = settle(balances);

    // At most n-1 transfers.
    expect(transfers.length).toBeLessThanOrEqual(n - 1);

    // Every transfer is positive and not a self-transfer.
    for (const t of transfers) {
      expect(t.amountCents).toBeGreaterThan(0);
      expect(t.fromId).not.toBe(t.toId);
    }

    // Applying the transfers zeroes everyone out.
    const after = applyTransfers(balances, transfers);
    for (const v of after.values()) {
      expect(v).toBe(0);
    }
  });

  it("is deterministic for repeated runs", () => {
    const balances = new Map<ID, number>([
      ["A", -700],
      ["B", -300],
      ["C", 500],
      ["D", 500],
    ]);
    const first = settle(new Map(balances));
    const second = settle(new Map(balances));
    expect(first).toEqual(second);
  });

  it("matches the largest debtor to the largest creditor first", () => {
    const balances = new Map<ID, number>([
      ["A", -1000],
      ["B", 600],
      ["C", 400],
    ]);
    const transfers = settle(balances);
    // Largest debtor A pays largest creditor B first.
    expect(transfers[0]).toEqual({ fromId: "A", toId: "B", amountCents: 600 });
    const after = applyTransfers(balances, transfers);
    for (const v of after.values()) expect(v).toBe(0);
    expect(transfers.length).toBeLessThanOrEqual(balances.size - 1);
  });
});

describe("settlement boundaries", () => {
  it("settles totals exceeding the number range when each balance is safe", () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const balances = new Map([["A", maximum], ["B", maximum], ["C", -maximum], ["D", -maximum]]);
    const before = new Map(balances);
    expect([...applyTransfers(balances, settle(balances)).values()]).toEqual([0, 0, 0, 0]);
    expect(settle(balances)).toEqual(settle(new Map([...balances].reverse())));
    expect(balances).toEqual(before);
    // A number sum rounds this one-cent imbalance to zero in this order.
    expect(() => settle(new Map([["A", maximum], ["B", 2], ["C", -maximum], ["D", -1]]))).toThrow(RangeError);
  });

  it("is greedy without promising the minimum transfer count", () => {
    const balances = new Map([["A", -8], ["B", -5], ["C", -5], ["D", 10], ["E", 8]]);
    const transfers = settle(balances);
    expect(transfers).toHaveLength(4);
    expect([...applyTransfers(balances, transfers).values()]).toEqual([0, 0, 0, 0, 0]);
    expect([...applyTransfers(balances, [
      { fromId: "A", toId: "E", amountCents: 8 },
      { fromId: "B", toId: "D", amountCents: 5 },
      { fromId: "C", toId: "D", amountCents: 5 },
    ]).values()]).toEqual([0, 0, 0, 0, 0]);
  });

  it("rejects malformed and unbalanced balances rather than returning a partial plan", () => {
    for (const value of [NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => settle(new Map([["A", value], ["B", -value]]))).toThrow(RangeError);
    }
    expect(() => settle(new Map([["A", 100], ["B", -99]]))).toThrow(RangeError);
  });

  it("breaks magnitude ties by ID independently of insertion order", () => {
    const balances = new Map([["D", 100], ["B", -100], ["C", 100], ["A", -100]]);
    expect(settle(balances)).toEqual(settle(new Map([...balances].reverse())));
    expect(settle(balances)[0]).toEqual({ fromId: "A", toId: "C", amountCents: 100 });
  });

  it("clears safe integer limits without changing the original map", () => {
    const balances = new Map([["A", Number.MAX_SAFE_INTEGER], ["B", -Number.MAX_SAFE_INTEGER]]);
    expect([...applyTransfers(balances, settle(balances)).values()]).toEqual([0, 0]);
    expect(balances.get("A")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
