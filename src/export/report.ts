import type { Expense, Group, ID } from "../types";
import {
  computeBalances,
  computeExpenseShares,
  payerCredit,
  expenseTotalCents,
} from "../engine/balances";
import { settle } from "../engine/settle";

export interface ReportSections {
  settleUp: boolean;
  expenses: boolean;
  perPerson: boolean;
}

export interface ReportData {
  header: { groupName: string; generatedDate: string };
  settleUp?: {
    netBalances: { name: string; cents: number }[];
    transfers: { from: string; to: string; cents: number }[];
  };
  expenses?: {
    description: string;
    date: string;
    payerName: string;
    amountCents: number;
    splitSummary: string;
    items?: { name: string; cents: number; assigneeNames: string[] }[];
  }[];
  perPerson?: {
    name: string;
    paidCents: number;
    owedCents: number;
    netCents: number;
    contributions: { description: string; owedCents: number }[];
  }[];
}

function splitSummary(expense: Expense): string {
  if (Array.isArray(expense.items) && expense.items.length > 0) return "Itemised";
  switch (expense.splitType) {
    case "equal":
      return `Equal among ${expense.members.length}`;
    case "exact":
      return "Exact amounts";
    case "percent":
      return "Percentage";
    case "shares":
      return "Shares";
  }
}

export function buildReport(
  group: Group,
  opts: { sections: ReportSections; generatedDate: string },
): ReportData {
  const nameOf = new Map<ID, string>(group.people.map((p) => [p.id, p.name]));
  const name = (id: ID): string => nameOf.get(id) ?? "Unknown";

  const data: ReportData = {
    header: { groupName: group.name, generatedDate: opts.generatedDate },
  };

  if (opts.sections.settleUp) {
    const balances = computeBalances(group);
    data.settleUp = {
      netBalances: group.people.map((p) => ({
        name: p.name,
        cents: balances.get(p.id) ?? 0,
      })),
      transfers: settle(balances).map((t) => ({
        from: name(t.fromId),
        to: name(t.toId),
        cents: t.amountCents,
      })),
    };
  }

  if (opts.sections.expenses) {
    data.expenses = group.expenses.map((e) => {
      const itemized = Array.isArray(e.items) && e.items.length > 0;
      return {
        description: e.description,
        date: e.date,
        payerName: name(e.payerId),
        amountCents: expenseTotalCents(e),
        splitSummary: splitSummary(e),
        items: itemized
          ? e.items!.map((it) => ({
              name: it.name,
              cents: it.amountCents,
              assigneeNames: it.assigneeIds.map(name),
            }))
          : undefined,
      };
    });
  }

  if (opts.sections.perPerson) {
    data.perPerson = group.people.map((p) => {
      let paidCents = 0;
      let owedCents = 0;
      const contributions: { description: string; owedCents: number }[] = [];
      for (const e of group.expenses) {
        if (e.payerId === p.id) paidCents += payerCredit(e);
        const share = computeExpenseShares(e).get(p.id) ?? 0;
        if (share !== 0) {
          owedCents += share;
          contributions.push({ description: e.description, owedCents: share });
        }
      }
      return {
        name: p.name,
        paidCents,
        owedCents,
        netCents: paidCents - owedCents,
        contributions,
      };
    });
  }

  return data;
}
