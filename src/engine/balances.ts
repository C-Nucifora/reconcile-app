import type { Expense, Group, ID } from "../types";
import { splitCents } from "./money";

/**
 * Compute, for a single expense, how many cents each included member owes.
 * Returns a Map of personId -> cents owed for this expense only.
 *
 *  - equal:   split the amount evenly using ones as weights.
 *  - exact:   each member's value is the cents they owe (assumed to sum to amount).
 *  - percent: split using each member's percentage points as weights.
 *  - shares:  split using each member's share count as weights.
 */
export function computeExpenseShares(expense: Expense): Map<ID, number> {
  const shares = new Map<ID, number>();
  const members = expense.members;
  if (members.length === 0) return shares;

  if (expense.splitType === "exact") {
    for (const m of members) {
      shares.set(m.personId, (shares.get(m.personId) ?? 0) + Math.trunc(m.value));
    }
    return shares;
  }

  let weights: number[];
  switch (expense.splitType) {
    case "equal":
      weights = members.map(() => 1);
      break;
    case "percent":
      weights = members.map((m) => m.value);
      break;
    case "shares":
      weights = members.map((m) => m.value);
      break;
    default:
      weights = members.map(() => 1);
      break;
  }

  const parts = splitCents(expense.amountCents, weights);
  for (let i = 0; i < members.length; i++) {
    const id = members[i].personId;
    shares.set(id, (shares.get(id) ?? 0) + parts[i]);
  }
  return shares;
}

/**
 * Compute the net balance (in cents) for every person in the group.
 * Net = total paid - total owed. Every person in group.people is present,
 * defaulting to 0. The sum of all nets is exactly 0.
 */
export function computeBalances(group: Group): Map<ID, number> {
  const balances = new Map<ID, number>();
  for (const person of group.people) {
    balances.set(person.id, 0);
  }

  for (const expense of group.expenses) {
    // The payer fronted the whole amount.
    balances.set(
      expense.payerId,
      (balances.get(expense.payerId) ?? 0) + expense.amountCents
    );

    // Each member owes their share.
    const shares = computeExpenseShares(expense);
    for (const [personId, owed] of shares) {
      balances.set(personId, (balances.get(personId) ?? 0) - owed);
    }
  }

  return balances;
}
