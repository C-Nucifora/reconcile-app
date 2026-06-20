import type { ID, Transfer } from "../types";

interface Entry {
  id: ID;
  amount: number;
}

/**
 * Greedy minimum cash-flow settlement.
 *
 * Splits balances into debtors (negative net) and creditors (positive net),
 * then repeatedly settles the largest debt against the largest credit,
 * emitting a Transfer for each step. Produces at most n-1 transfers, ignores
 * residual balances smaller than one cent, and never emits a self-transfer.
 *
 * Ordering is deterministic: at each step the largest magnitudes are matched,
 * with ties broken by id.
 */
export function settle(balances: Map<ID, number>): Transfer[] {
  const debtors: Entry[] = [];
  const creditors: Entry[] = [];

  for (const [id, value] of balances) {
    const amount = Math.round(value);
    if (amount <= -1) {
      debtors.push({ id, amount: -amount }); // store positive magnitude owed
    } else if (amount >= 1) {
      creditors.push({ id, amount });
    }
    // |amount| < 1 cent is treated as settled and ignored.
  }

  const byAmountThenId = (a: Entry, b: Entry) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  const transfers: Transfer[] = [];

  // Re-sort each iteration so the current largest debtor/creditor are at the
  // front. This keeps the matching deterministic and the transfer count <= n-1.
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmountThenId);
    creditors.sort(byAmountThenId);

    const debtor = debtors[0];
    const creditor = creditors[0];

    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0 && debtor.id !== creditor.id) {
      transfers.push({
        fromId: debtor.id,
        toId: creditor.id,
        amountCents: amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 1) debtors.shift();
    if (creditor.amount < 1) creditors.shift();
  }

  return transfers;
}
