import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { computeBalances, pendingCents } from "../engine/balances";
import { formatCents } from "../engine/money";

export function BalancesPanel() {
  const { activeGroup } = useApp();

  const rows = useMemo(() => {
    if (!activeGroup) return [];
    const balances = computeBalances(activeGroup);
    return activeGroup.people.map((person) => ({
      id: person.id,
      name: person.name,
      net: balances.get(person.id) ?? 0,
    }));
  }, [activeGroup]);

  const pending = useMemo(() => {
    if (!activeGroup) return { cents: 0, count: 0 };
    let cents = 0;
    let count = 0;
    for (const expense of activeGroup.expenses) {
      const p = pendingCents(expense);
      if (p > 0) {
        cents += p;
        for (const item of expense.items ?? []) {
          if (item.assigneeIds.length === 0) count += 1;
        }
      }
    }
    return { cents, count };
  }, [activeGroup]);

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-fg">Balances</h2>

      {!activeGroup ? (
        <p className="mt-3 text-sm text-muted">
          Select or create a group to see balances.
        </p>
      ) : activeGroup.people.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Add some people to this group to see balances.
        </p>
      ) : activeGroup.expenses.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No expenses yet. Add an expense to see who owes what.
        </p>
      ) : (
        <>
          {pending.cents > 0 && (
            <div className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              <span className="tabular-nums">{formatCents(pending.cents)}</span>{" "}
              across {pending.count}{" "}
              {pending.count === 1 ? "item" : "items"} not yet allocated
            </div>
          )}
          <ul className="mt-4 divide-y divide-line">
            {rows.map((row) => {
              const isOwed = row.net > 0;
              const owes = row.net < 0;
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <span className="font-medium text-fg">{row.name}</span>
                  {isOwed ? (
                    <span className="text-sm font-semibold tabular-nums text-positive">
                      is owed {formatCents(row.net)}
                    </span>
                  ) : owes ? (
                    <span className="text-sm font-semibold tabular-nums text-negative">
                      owes {formatCents(-row.net)}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-muted">
                      settled
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
