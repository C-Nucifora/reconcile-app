import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { computeBalances } from "../engine/balances";
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Balances</h2>

      {!activeGroup ? (
        <p className="mt-3 text-sm text-slate-500">
          Select or create a group to see balances.
        </p>
      ) : activeGroup.people.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Add some people to this group to see balances.
        </p>
      ) : activeGroup.expenses.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No expenses yet. Add an expense to see who owes what.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((row) => {
            const isOwed = row.net > 0;
            const owes = row.net < 0;
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="font-medium text-slate-800">{row.name}</span>
                {isOwed ? (
                  <span className="text-sm font-semibold text-emerald-600">
                    is owed {formatCents(row.net)}
                  </span>
                ) : owes ? (
                  <span className="text-sm font-semibold text-red-600">
                    owes {formatCents(-row.net)}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-slate-400">
                    settled
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
