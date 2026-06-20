import type { Expense, Group, ID } from "../types";
import { splitCents } from "./money";

/**
 * Compute, for a single expense, how many cents each included member owes.
 * Returns a Map of personId -> cents owed for this expense only.
 *
 *  - equal:   split the amount evenly using ones as weights.
 *  - exact:   each member's value is the cents they owe; values are truncated to
 *             integer cents and then reconciled so they sum exactly to
 *             amountCents (the leftover/overage is adjusted on the members with
 *             the largest truncation remainder, last-member tie-break).
 *  - percent: split using each member's percentage points as weights.
 *  - shares:  split using each member's share count as weights.
 *
 * For every split type the returned shares sum exactly to amountCents (when
 * there is at least one member), so balances always net to zero.
 */
export function computeExpenseShares(expense: Expense): Map<ID, number> {
  const shares = new Map<ID, number>();
  const members = expense.members;
  if (members.length === 0) return shares;

  if (expense.splitType === "exact") {
    // Truncate each member's value to integer cents, then reconcile the parts
    // so they sum exactly to amountCents. A self-enforcing engine must not
    // trust the caller (imported/hand-edited state can carry exact values that
    // do not sum to the total); without this the nets would not net to zero.
    const truncated = members.map((m) => Math.trunc(m.value));
    const reconciled = reconcileExact(expense.amountCents, members, truncated);
    for (let i = 0; i < members.length; i++) {
      const id = members[i].personId;
      shares.set(id, (shares.get(id) ?? 0) + reconciled[i]);
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
 * Adjust truncated exact-split parts so they sum exactly to amountCents.
 *
 * Distributes any shortfall (or removes any overage) one cent at a time. A
 * shortfall is added to the members with the largest fractional remainder
 * first; an overage is removed from the members with the smallest remainder
 * first (without driving a part below zero). Ties break by member order so the
 * result is deterministic.
 */
function reconcileExact(
  amountCents: number,
  members: Expense["members"],
  truncated: number[],
): number[] {
  const target = Math.trunc(amountCents);
  const result = truncated.slice();
  const current = result.reduce((a, b) => a + b, 0);
  let diff = target - current;
  if (diff === 0) return result;

  // Order members by fractional remainder of their original value, descending,
  // tie-broken by index for determinism.
  const order = members.map((m, i) => ({
    index: i,
    rem: m.value - Math.trunc(m.value),
  }));
  order.sort((a, b) => (b.rem !== a.rem ? b.rem - a.rem : a.index - b.index));

  if (diff > 0) {
    // Add the shortfall to the largest remainders first, wrapping if needed.
    let k = 0;
    while (diff > 0) {
      result[order[k % order.length].index] += 1;
      diff -= 1;
      k += 1;
    }
  } else {
    // Remove the overage from the smallest remainders first, never below zero.
    let removed = -diff;
    let guard = 0;
    const maxPasses = removed + order.length;
    while (removed > 0 && guard < maxPasses) {
      for (let k = order.length - 1; k >= 0 && removed > 0; k--) {
        const idx = order[k].index;
        if (result[idx] > 0) {
          result[idx] -= 1;
          removed -= 1;
        }
      }
      guard += 1;
    }
  }

  return result;
}

/**
 * Compute the net balance (in cents) for every person in the group.
 * Net = total paid - total owed. Every person in group.people is present,
 * defaulting to 0.
 *
 * The engine credits each payer the full expense.amountCents and debits the
 * per-expense shares, which (because computeExpenseShares always allocates
 * exactly amountCents for a non-empty member list) net to zero across the
 * group. An expense with an empty member list contributes only the payer
 * credit and so would leave a residual; the UI blocks empty splits and load
 * validation drops them, so in practice the nets sum to zero.
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
