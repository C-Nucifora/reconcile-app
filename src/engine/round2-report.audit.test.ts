import { describe, expect, it } from "vitest";
import type { AppState, Expense, Group, SplitType } from "../types";
import { buildReport } from "../export/report";
import { reducer } from "../state/reducer";
import { validateState } from "../state/storage";
import { computeBalances, computeExpenseShares } from "./balances";

const ids = ["a", "b", "c", "d"];
const allSections = { settleUp: true, expenses: true, perPerson: true };
const generatedDate = "2026-11-12";
const maximum = Number.MAX_SAFE_INTEGER;

function stateWith(expenses: Expense[]): AppState {
  return {
    schemaVersion: 1, activeGroupId: "g",
    groups: [{
      id: "g", name: "Fictional audit outing",
      people: ids.map((id) => ({ id, name: `Fictional ${id}` })), expenses,
    }],
  };
}

function expense(splitType: SplitType, values: number[], amountCents = 17): Expense {
  return {
    id: "e", description: "Fictional purchase", date: "2026-11-12",
    payerId: "a", amountCents, splitType,
    members: values.map((value, index) => ({ personId: ids[index], value })),
  };
}

function permutations<T>(values: T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map((rest) => [value, ...rest]));
}

// Integer fixture ratios avoid parsing decimal strings like the production code.
// Pairwise ranks select remainder winners without sorting an allocation list.
function quotaOracle(total: number, units: bigint[]): number[] {
  const denominator = units.reduce((sum, value) => sum + value, 0n);
  const numerators = units.map((value) => BigInt(total) * value);
  const floors = numerators.map((value) => value / denominator);
  const remainders = numerators.map((value) => value % denominator);
  const remaining = BigInt(total) - floors.reduce((sum, value) => sum + value, 0n);
  return floors.map((value, index) => {
    const rank = remainders.filter((other, i) => other > remainders[index] ||
      (other === remainders[index] && i < index)).length;
    return Number(value + (BigInt(rank) < remaining ? 1n : 0n));
  });
}

interface ExpectedExpense { owed: Record<string, number>; pending: number }

function assertReport(group: Group, expected: ExpectedExpense[]): void {
  const before = structuredClone(group);
  const report = buildReport(group, { sections: allSections, generatedDate });
  const accounts = new Map(group.people.map((person) => [person.id, { paid: 0n, owed: 0n }]));
  const contributions = new Map(group.people.map((person) => [person.id, [] as { description: string; owedCents: number }[]]));
  let total = 0n;
  let pending = 0n;
  expect(expected).toHaveLength(group.expenses.length);
  group.expenses.forEach((entry, index) => {
    const oracle = expected[index];
    const credit = Object.values(oracle.owed).reduce((sum, value) => sum + BigInt(value), 0n);
    expect(credit + BigInt(oracle.pending)).toBe(BigInt(entry.amountCents));
    expect(report.expenses![index]).toMatchObject({
      description: entry.description, amountCents: entry.amountCents, pendingCents: oracle.pending,
      payerName: group.people.find((person) => person.id === entry.payerId)!.name,
    });
    const shares = computeExpenseShares(entry);
    for (const person of group.people) expect(shares.get(person.id) ?? 0).toBe(oracle.owed[person.id] ?? 0);
    accounts.get(entry.payerId)!.paid += credit;
    for (const [id, owed] of Object.entries(oracle.owed)) {
      accounts.get(id)!.owed += BigInt(owed);
      if (owed > 0) contributions.get(id)!.push({ description: entry.description, owedCents: owed });
    }
    total += BigInt(entry.amountCents);
    pending += BigInt(oracle.pending);
  });
  const balances = computeBalances(group);
  const unsettled = new Map<string, bigint>();
  group.people.forEach((person, index) => {
    const account = accounts.get(person.id)!;
    const net = account.paid - account.owed;
    expect(report.perPerson![index]).toEqual({
      name: person.name, paidCents: Number(account.paid), owedCents: Number(account.owed),
      netCents: Number(net), contributions: contributions.get(person.id),
    });
    expect(report.settleUp!.netBalances[index]).toEqual({ name: person.name, cents: Number(net) });
    expect(balances.get(person.id)).toBe(Number(net));
    unsettled.set(person.name, net);
  });
  const paid = report.perPerson!.reduce((sum, person) => sum + BigInt(person.paidCents), 0n);
  const owed = report.perPerson!.reduce((sum, person) => sum + BigInt(person.owedCents), 0n);
  expect(paid).toBe(owed);
  expect(paid + pending).toBe(total);
  for (const transfer of report.settleUp!.transfers) {
    expect(Number.isSafeInteger(transfer.cents) && transfer.cents > 0).toBe(true);
    expect(transfer.from).not.toBe(transfer.to);
    expect(unsettled.has(transfer.from) && unsettled.has(transfer.to)).toBe(true);
    unsettled.set(transfer.from, unsettled.get(transfer.from)! + BigInt(transfer.cents));
    unsettled.set(transfer.to, unsettled.get(transfer.to)! - BigInt(transfer.cents));
  }
  expect([...unsettled.values()]).toEqual(group.people.map(() => 0n));
  expect(report.settleUp!.transfers.length).toBeLessThanOrEqual(Math.max(0, group.people.length - 1));
  expect(group).toEqual(before);
}

function reload(state: AppState): AppState {
  const migrated = validateState(JSON.parse(JSON.stringify({ ...state, schemaVersion: undefined })));
  expect(migrated).toEqual(state);
  return migrated;
}

describe("round 2 allocation and report oracles", () => {
  it.each([
    { mode: "equal", values: [0, 0, 0, 0], units: [1n, 1n, 1n, 1n] },
    { mode: "shares", values: [1, 7, 7, 3], units: [1n, 7n, 7n, 3n] },
    { mode: "percent", values: [0.0000001, 0.0000011, 49.9999994, 49.9999994], units: [1n, 11n, 499999994n, 499999994n] },
  ] as const)("matches an independent $mode oracle across every member order and safe totals", ({ mode, values, units }) => {
    for (const order of permutations([0, 1, 2, 3])) {
      for (const total of [0, 1, 17, maximum]) {
        const entry = expense(mode, [...values], total);
        entry.members = order.map((index) => entry.members[index]);
        const expected = quotaOracle(total, order.map((index) => units[index]));
        const owed = Object.fromEntries(entry.members.map((member, index) => [member.personId, expected[index]]));
        const state = reload(stateWith([entry]));
        assertReport(state.groups[0], [{ owed, pending: 0 }]);
        const reversedPeople = { ...state.groups[0], people: [...state.groups[0].people].reverse() };
        assertReport(reversedPeople, [{ owed, pending: 0 }]);
        expect(buildReport(reversedPeople, { sections: allSections, generatedDate }).settleUp!.transfers)
          .toEqual(buildReport(state.groups[0], { sections: allSections, generatedDate }).settleUp!.transfers);
      }
    }
  });

  it("assigns tied item cents in assignee order and preserves totals when item order changes", () => {
    for (const order of permutations(ids)) {
      const entry: Expense = {
        ...expense("equal", []), amountCents: 11, members: [],
        items: [
          { id: "first", name: "Fictional first", amountCents: 2, assigneeIds: order },
          { id: "second", name: "Fictional second", amountCents: 5, assigneeIds: [...order].reverse() },
          { id: "pending", name: "Fictional pending", amountCents: 4, assigneeIds: [] },
        ],
      };
      const owed = Object.fromEntries(order.map((id, index) => [id, [2, 2, 1, 2][index]]));
      const state = reload(stateWith([entry]));
      assertReport(state.groups[0], [{ owed, pending: 4 }]);
      const reversed = structuredClone(state.groups[0]);
      reversed.expenses[0].items!.reverse();
      assertReport(reversed, [{ owed, pending: 4 }]);
    }
  });
});

const modes = ["equal", "exact", "percent", "shares", "items"] as const;
type Mode = typeof modes[number];

function modeExpense(mode: Mode): Expense {
  if (mode === "items") return {
    ...expense("equal", []), members: [], items: [
      { id: "shared", name: "Fictional shared", amountCents: 5, assigneeIds: ["b", "c", "d"] },
      { id: "solo", name: "Fictional solo", amountCents: 7, assigneeIds: ["b"] },
      { id: "pending", name: "Fictional pending", amountCents: 5, assigneeIds: [] },
    ],
  };
  return expense(mode, mode === "equal" ? [0, 0, 0, 0] : mode === "exact" ? [1, 3, 5, 8]
    : mode === "percent" ? [10, 20, 30, 40] : [1, 2, 3, 4]);
}

const deletionOracles: Record<Mode, ExpectedExpense[]> = {
  equal: [
    { owed: { a: 5, b: 4, c: 4, d: 4 }, pending: 0 },
    { owed: { a: 6, c: 6, d: 5 }, pending: 0 },
    { owed: { a: 9, d: 8 }, pending: 0 },
    { owed: { a: 17 }, pending: 0 },
  ],
  exact: [
    { owed: { a: 1, b: 3, c: 5, d: 8 }, pending: 0 },
    { owed: { a: 2, c: 6, d: 9 }, pending: 0 },
    { owed: { a: 5, d: 12 }, pending: 0 },
    { owed: { a: 17 }, pending: 0 },
  ],
  percent: [
    { owed: { a: 2, b: 3, c: 5, d: 7 }, pending: 0 },
    { owed: { a: 2, c: 6, d: 9 }, pending: 0 },
    { owed: { a: 3, d: 14 }, pending: 0 },
    { owed: { a: 17 }, pending: 0 },
  ],
  shares: [
    { owed: { a: 2, b: 3, c: 5, d: 7 }, pending: 0 },
    { owed: { a: 2, c: 6, d: 9 }, pending: 0 },
    { owed: { a: 3, d: 14 }, pending: 0 },
    { owed: { a: 17 }, pending: 0 },
  ],
  items: [
    { owed: { a: 0, b: 9, c: 2, d: 1 }, pending: 5 },
    { owed: { a: 0, c: 3, d: 2 }, pending: 12 },
    { owed: { a: 0, d: 5 }, pending: 12 },
    { owed: { a: 0 }, pending: 17 },
  ],
};

describe("round 2 durable edits and report integration", () => {
  it.each(modes.flatMap((from) => modes.map((to) => ({ from, to }))))(
    "replaces $from with $to then reports every sequential deletion after migration",
    ({ from, to }) => {
      const initial = reload(stateWith([modeExpense(from)]));
      assertReport(initial.groups[0], [deletionOracles[from][0]]);
      let state = reload(reducer(initial, { type: "UPDATE_EXPENSE", groupId: "g", expense: modeExpense(to) }));
      expect(state.groups[0].expenses).toEqual([modeExpense(to)]);
      assertReport(state.groups[0], [deletionOracles[to][0]]);
      for (const [index, personId] of ["b", "c", "d"].entries()) {
        state = reload(reducer(state, { type: "REMOVE_PERSON", groupId: "g", personId }));
        assertReport(state.groups[0], [deletionOracles[to][index + 1]]);
        const staleEdit = reducer(state, { type: "UPDATE_EXPENSE", groupId: "g", expense: modeExpense(from) });
        expect(staleEdit).toBe(state);
      }
      state = reload(reducer(state, { type: "REMOVE_PERSON", groupId: "g", personId: "a" }));
      expect(state.groups[0].expenses).toEqual([]);
      assertReport(state.groups[0], []);
      expect(initial).toEqual(stateWith([modeExpense(from)]));
    },
  );

  it("keeps safe-max reports exact through pending edits, overflow rejection, deletion and retry", () => {
    const huge: Expense = {
      ...expense("exact", []), id: "huge", amountCents: maximum - 18,
      members: [{ personId: "b", value: maximum - 18 }],
    };
    const itemized: Expense = {
      ...expense("equal", []), id: "items", payerId: "c", members: [], items: [
        { id: "self", name: "Fictional self", amountCents: 1, assigneeIds: ["c"] },
        { id: "pending", name: "Fictional pending", amountCents: 16, assigneeIds: [] },
      ],
    };
    const tiny: Expense = {
      ...expense("exact", []), id: "tiny", payerId: "b", amountCents: 1,
      members: [{ personId: "a", value: 1 }],
    };
    const expected: Record<string, ExpectedExpense> = {
      huge: { owed: { b: maximum - 18 }, pending: 0 },
      items: { owed: { c: 1 }, pending: 16 },
      tiny: { owed: { a: 1 }, pending: 0 },
    };
    for (const entries of permutations([huge, itemized, tiny])) {
      const group = reload(stateWith(entries)).groups[0];
      assertReport(group, entries.map((entry) => expected[entry.id]));
    }
    const initial = reload(stateWith([huge, itemized, tiny]));
    const increased = { ...itemized, amountCents: 18, items: itemized.items!.map((item) =>
      item.id === "pending" ? { ...item, amountCents: 17 } : item) };
    expect(reducer(initial, { type: "UPDATE_EXPENSE", groupId: "g", expense: increased })).toBe(initial);
    expect(reducer(initial, { type: "ADD_EXPENSE", groupId: "g", expense: { ...tiny, id: "overflow" } })).toBe(initial);
    let state = reducer(initial, { type: "DELETE_EXPENSE", groupId: "g", expenseId: "tiny" });
    state = reload(reducer(state, { type: "UPDATE_EXPENSE", groupId: "g", expense: increased }));
    assertReport(state.groups[0], [expected.huge, { owed: { c: 1 }, pending: 17 }]);
    const assigned = { ...increased, items: increased.items.map((item) =>
      item.id === "pending" ? { ...item, assigneeIds: ["a", "c"] } : item) };
    state = reload(reducer(state, { type: "UPDATE_EXPENSE", groupId: "g", expense: assigned }));
    assertReport(state.groups[0], [expected.huge, { owed: { a: 9, c: 9 }, pending: 0 }]);
    state = reload(reducer(state, { type: "REMOVE_PERSON", groupId: "g", personId: "c" }));
    assertReport(state.groups[0], [expected.huge]);
    state = reload(reducer(state, { type: "REMOVE_PERSON", groupId: "g", personId: "b" }));
    assertReport(state.groups[0], []);
  });
});
