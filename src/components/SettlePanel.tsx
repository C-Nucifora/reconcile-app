import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { computeBalances } from "../engine/balances";
import { settle } from "../engine/settle";
import { formatCents } from "../engine/money";

export function SettlePanel() {
  const { activeGroup } = useApp();

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    if (activeGroup) {
      for (const person of activeGroup.people) map.set(person.id, person.name);
    }
    return map;
  }, [activeGroup]);

  const transfers = useMemo(() => {
    if (!activeGroup) return [];
    return settle(computeBalances(activeGroup));
  }, [activeGroup]);

  const hasData =
    !!activeGroup &&
    activeGroup.people.length > 0 &&
    activeGroup.expenses.length > 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-fg">Settle up</h2>

      {!hasData ? (
        <p className="mt-3 text-sm text-muted">
          Add people and expenses to get a settlement plan.
        </p>
      ) : transfers.length === 0 ? (
        <div className="mt-4 rounded-lg bg-positive-soft px-4 py-3 text-sm font-semibold text-positive">
          All settled up!
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {transfers.map((transfer, index) => (
            <li
              key={`${transfer.fromId}-${transfer.toId}-${index}`}
              className="flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-4 py-2.5 text-sm"
            >
              <span className="text-muted">
                <span className="font-medium text-fg">
                  {nameOf.get(transfer.fromId) ?? "Unknown"}
                </span>{" "}
                pays{" "}
                <span className="font-medium text-fg">
                  {nameOf.get(transfer.toId) ?? "Unknown"}
                </span>
              </span>
              <span className="font-semibold tabular-nums text-fg">
                {formatCents(transfer.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
