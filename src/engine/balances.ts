import type { Expense, Group, ID } from "../types";
import { isValidCents, splitCents, sumCents } from "./money";

function isItemized(expense: Expense): boolean {
  return Array.isArray(expense.items) && expense.items.length > 0;
}

/** Allocated debits only. Unassigned items remain pending. */
export function computeExpenseShares(expense: Expense): Map<ID, number> {
  const shares = new Map<ID, number>();
  if (!isValidCents(expense.amountCents)) throw new RangeError("Invalid expense amount.");

  if (isItemized(expense)) {
    expenseTotalCents(expense);
    for (const item of expense.items!) {
      const assignees = [...new Set(item.assigneeIds)];
      const parts = splitCents(item.amountCents, assignees.map(() => 1));
      assignees.forEach((id, i) => shares.set(id, sumCents([shares.get(id) ?? 0, parts[i]])));
    }
    return shares;
  }

  const members = expense.members;
  if (members.length === 0) return shares;
  if (new Set(members.map((member) => member.personId)).size !== members.length) {
    throw new RangeError("An expense must include each member only once.");
  }

  const parts = expense.splitType === "exact"
    ? reconcileExact(expense.amountCents, members.map((member) => member.value))
    : splitCents(expense.amountCents, members.map((member) => expense.splitType === "equal" ? 1 : member.value));
  members.forEach((member, i) => shares.set(member.personId, parts[i]));
  return shares;
}

/**
 * Repair legacy exact splits in batches. Add to largest decimal remainders,
 * earlier members first; remove from smallest remainders, later members first.
 */
function reconcileExact(target: number, values: number[]): number[] {
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Exact amounts must be finite, non-negative and within the safe cent range.");
  }
  const result = values.map((value) => BigInt(Math.trunc(value)));
  const current = result.reduce((sum, value) => sum + value, 0n);
  const difference = BigInt(target) - current;
  // Subtraction can make equal decimal fractions compare unequal, e.g. 0.1 and 1.1.
  const order = values.map((value, index) => ({
    index,
    remainder: value < 1 ? value : Number(`0.${String(value).split(".")[1] ?? "0"}`),
  }));
  order.sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  if (difference > 0n) {
    const each = difference / BigInt(values.length);
    const extra = Number(difference % BigInt(values.length));
    order.forEach(({ index }, position) => { result[index] += each + (position < extra ? 1n : 0n); });
  } else if (difference < 0n) {
    // Find the number of whole removal rounds, skipping exhausted members.
    const removed = -difference;
    let low = 0n;
    let high = result.reduce((max, value) => value > max ? value : max, 0n);
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      const count = result.reduce((sum, value) => sum + (value < middle ? value : middle), 0n);
      if (count <= removed) low = middle;
      else high = middle - 1n;
    }
    let remainder = removed;
    result.forEach((value, index) => {
      const reduction = value < low ? value : low;
      result[index] -= reduction;
      remainder -= reduction;
    });
    for (const { index } of order.reverse()) {
      if (remainder === 0n) break;
      if (result[index] > 0n) {
        result[index] -= 1n;
        remainder -= 1n;
      }
    }
  }
  return result.map(Number);
}

/** The payer receives exactly the amount allocated to members. */
export function payerCredit(expense: Expense): number {
  return sumCents(computeExpenseShares(expense).values());
}

/** Unassigned items do not affect balances until someone is assigned. */
export function pendingCents(expense: Expense): number {
  return isItemized(expense)
    ? sumCents(expense.items!.filter((item) => item.assigneeIds.length === 0).map((item) => item.amountCents))
    : 0;
}

export function expenseTotalCents(expense: Expense): number {
  return sumCents(isItemized(expense) ? expense.items!.map((item) => item.amountCents) : [expense.amountCents]);
}

/** Net = paid - owed. Accumulate exactly, then check the public number range. */
export function computeBalances(group: Group): Map<ID, number> {
  const balances = new Map<ID, bigint>(group.people.map((person) => [person.id, 0n]));
  for (const expense of group.expenses) {
    const shares = computeExpenseShares(expense);
    const credit = sumCents(shares.values());
    if (!balances.has(expense.payerId) || [...shares.keys()].some((id) => !balances.has(id))) {
      throw new RangeError("Expense references an unknown person.");
    }
    balances.set(expense.payerId, balances.get(expense.payerId)! + BigInt(credit));
    for (const [id, owed] of shares) balances.set(id, balances.get(id)! - BigInt(owed));
  }
  return new Map([...balances].map(([id, balance]) => {
    const value = Number(balance);
    if (!Number.isSafeInteger(value)) throw new RangeError("Balance exceeds the safe cent range.");
    return [id, value];
  }));
}
