import { describe, expect, it } from "vitest";
import type { Expense, Group, SplitType } from "../types";
import { computeBalances, computeExpenseShares, expenseTotalCents, payerCredit, pendingCents } from "./balances";
import { settle } from "./settle";
import { splitCents } from "./money";
import { reducer } from "../state/reducer";

// Fixed seed makes a failed generated ledger reproducible.
function randomGenerator() {
  let seed = 240519;
  return (maximum: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
}

describe("generated ledger conservation", () => {
  it("matches cent-by-cent exact correction over 1500 decimal cases", () => {
    const random = randomGenerator();
    for (let sample = 0; sample < 1500; sample++) {
      const ticks = Array.from({ length: 1 + random(8) }, () => random(300));
      const target = random(200);
      const expected = ticks.map((value) => Math.floor(value / 10));
      let difference = target - expected.reduce((sum, value) => sum + value, 0);
      const order = ticks.map((value, index) => ({ index, remainder: value % 10 }));
      order.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
      if (difference < 0) order.reverse();
      // Deliberately use the slow one-cent rules as an independent small-input oracle.
      while (difference !== 0) {
        for (const { index } of order) {
          if (difference === 0) break;
          if (difference > 0) {
            expected[index]++;
            difference--;
          } else if (expected[index] > 0) {
            expected[index]--;
            difference++;
          }
        }
      }
      const expense: Expense = {
        id: "e", description: "Fictional exact split", date: "2026-01-01",
        payerId: "0", amountCents: target, splitType: "exact",
        members: ticks.map((value, index) => ({ personId: String(index), value: value / 10 })),
      };
      expect([...computeExpenseShares(expense).values()], `sample ${sample}`).toEqual(expected);
    }
  });

  it("preserves quota bounds, decimal ratios and cents in 1000 weighted cases", () => {
    const random = randomGenerator();
    for (let sample = 0; sample < 1000; sample++) {
      const units = Array.from({ length: 1 + random(12) }, () => random(1000000));
      units[0]++;
      const total = sample % 2 === 0 ? Number.MAX_SAFE_INTEGER - random(1000) : random(1000000);
      const weights = units.map((value) => value / 10000);
      const parts = splitCents(total, weights);
      const denominator = units.reduce((sum, value) => sum + BigInt(value), 0n);
      expect(parts.reduce((sum, value) => sum + BigInt(value), 0n)).toBe(BigInt(total));
      parts.forEach((part, index) => {
        expect(Number.isSafeInteger(part) && part >= 0).toBe(true);
        const numerator = BigInt(total) * BigInt(units[index]);
        expect(BigInt(part) >= numerator / denominator).toBe(true);
        expect(BigInt(part) <= (numerator + denominator - 1n) / denominator).toBe(true);
      });
      expect(parts).toEqual(splitCents(total, units));
      expect(parts).toEqual(splitCents(total, weights));
    }
  });

  it("conserves expense allocations, group balances and settlements across all split types", () => {
    const random = randomGenerator();
    for (let sample = 0; sample < 200; sample++) {
      const people = Array.from({ length: 2 + random(8) }, (_, i) => ({ id: String(i), name: String(i) }));
      const expenses: Expense[] = Array.from({ length: 5 + random(20) }, (_, i) => {
        const splitType: SplitType = (["equal", "exact", "percent", "shares"] as const)[i % 4];
        const amountCents = random(1000000);
        const members = people.filter(() => random(3) !== 0).map((person) => ({ personId: person.id, value: random(100) + 1 }));
        if (members.length === 0) members.push({ personId: people[0].id, value: 1 });
        const expense: Expense = { id: String(i), description: "", date: "2026-01-01", amountCents, splitType, payerId: people[random(people.length)].id, members };
        if (i % 5 === 0) {
          expense.items = Array.from({ length: 1 + random(6) }, (_, j) => ({ id: String(j), name: "", amountCents: random(100000), assigneeIds: people.filter(() => random(3) === 0).map((person) => person.id) }));
          expense.amountCents = expenseTotalCents(expense);
        }
        return expense;
      });
      for (const expense of expenses) {
        const shares = [...computeExpenseShares(expense).values()];
        expect(shares.every((share) => Number.isSafeInteger(share) && share >= 0)).toBe(true);
        expect(shares.reduce((sum, value) => sum + value, 0)).toBe(payerCredit(expense));
        expect(payerCredit(expense) + pendingCents(expense)).toBe(expenseTotalCents(expense));
      }
      const group: Group = { id: "g", name: "", people, expenses };
      const balances = computeBalances(group);
      expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
      const transfers = settle(balances);
      expect(transfers.length).toBeLessThanOrEqual(people.length - 1);
      expect(transfers).toEqual(settle(new Map([...balances].reverse())));
      const cleared = new Map(balances);
      for (const transfer of transfers) {
        expect(transfer.fromId).not.toBe(transfer.toId);
        expect(Number.isSafeInteger(transfer.amountCents) && transfer.amountCents > 0).toBe(true);
        cleared.set(transfer.fromId, cleared.get(transfer.fromId)! + transfer.amountCents);
        cleared.set(transfer.toId, cleared.get(transfer.toId)! - transfer.amountCents);
      }
      expect([...cleared.values()].every((value) => value === 0)).toBe(true);
    }
  });
});

describe("deletions through the caller", () => {
  const people = ["A", "B", "C"].map((id) => ({ id, name: `Fictional ${id}` }));
  const base: Expense = {
    id: "e", description: "Fictional expense", date: "2026-01-01", payerId: "A",
    amountCents: 100, splitType: "equal",
    members: [{ personId: "B", value: 20 }, { personId: "C", value: 80 }],
  };
  function remove(expense: Expense, personId: string) {
    return reducer({
      schemaVersion: 1, activeGroupId: "g",
      groups: [{ id: "g", name: "Fictional group", people, expenses: [expense] }],
    }, { type: "REMOVE_PERSON", groupId: "g", personId }).groups[0];
  }

  it.each(["equal", "exact", "percent", "shares"] as const)("conserves %s allocations after deleting a payer or member", (splitType) => {
    const expense = { ...base, splitType };
    const withoutPayer = remove(expense, "A");
    expect(withoutPayer.expenses).toEqual([]);
    expect([...computeBalances(withoutPayer).values()]).toEqual([0, 0]);

    const withoutMember = remove(expense, "B");
    expect([...computeExpenseShares(withoutMember.expenses[0])]).toEqual([["C", 100]]);
    expect([...computeBalances(withoutMember)]).toEqual([["A", 100], ["C", -100]]);
    expect(settle(computeBalances(withoutMember))).toEqual([{ fromId: "C", toId: "A", amountCents: 100 }]);

    const withoutOnlyMember = remove({ ...expense, members: [{ personId: "B", value: 100 }] }, "B");
    expect(withoutOnlyMember.expenses).toEqual([]);
    expect([...computeBalances(withoutOnlyMember).values()]).toEqual([0, 0]);
  });

  it("keeps an orphaned item pending and removes expenses belonging to a deleted payer", () => {
    const expense = { ...base, members: [], items: [
      { id: "shared", name: "Fictional shared item", amountCents: 31, assigneeIds: ["B", "C"] },
      { id: "solo", name: "Fictional solo item", amountCents: 69, assigneeIds: ["B"] },
    ] };
    const group = remove(expense, "B");
    expect(pendingCents(group.expenses[0])).toBe(69);
    expect(payerCredit(group.expenses[0])).toBe(31);
    expect(expenseTotalCents(group.expenses[0])).toBe(100);
    expect([...computeBalances(group)]).toEqual([["A", 31], ["C", -31]]);
    expect(settle(computeBalances(group))).toEqual([{ fromId: "C", toId: "A", amountCents: 31 }]);
    expect(remove(expense, "A").expenses).toEqual([]);
  });
});
