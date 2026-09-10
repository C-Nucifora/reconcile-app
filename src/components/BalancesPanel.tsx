import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { computeBalances, pendingCents } from "../engine/balances";
import { formatCents } from "../engine/money";
import { Avatar } from "./Icon";

export function BalancesPanel() {
  const { activeGroup } = useApp();
  const rows = useMemo(() => {
    if (!activeGroup) return [];
    const balances = computeBalances(activeGroup);
    return activeGroup.people.map((person) => ({
      ...person,
      net: balances.get(person.id) ?? 0,
    }));
  }, [activeGroup]);
  const pending =
    activeGroup?.expenses.reduce(
      (sum, expense) => sum + pendingCents(expense),
      0,
    ) ?? 0;
  return (
    <section className="balance-panel">
      <div className="panel-heading">
        <h2>Who's owed what</h2>
        <span className="count-badge">{rows.length}</span>
      </div>
      <p className="panel-subtitle">Everyone's balance, at a glance.</p>
      {pending > 0 && (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          ${formatCents(pending)} still needs to be assigned. Balances are
          provisional.
        </p>
      )}
      {rows.length ? (
        <ul className="balance-list">
          {rows.map((row) => (
            <li key={row.id} className="balance-row">
              <Avatar name={row.name} />
              <span className="balance-name">{row.name}</span>
              <span
                className={`balance-number ${row.net > 0 ? "text-positive" : row.net < 0 ? "text-negative" : "text-muted"}`}
              >
                <small>
                  {row.net > 0 ? "gets back" : row.net < 0 ? "owes" : "settled"}
                </small>
                ${formatCents(Math.abs(row.net))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-xs leading-relaxed text-muted">
          Add your people to see how the costs add up.
        </p>
      )}
    </section>
  );
}
