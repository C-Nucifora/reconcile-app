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
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Settle up</h2>

      {!hasData ? (
        <p className="mt-3 text-sm text-slate-500">
          Add people and expenses to get a settlement plan.
        </p>
      ) : transfers.length === 0 ? (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          All settled up!
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {transfers.map((transfer, index) => (
            <li
              key={`${transfer.fromId}-${transfer.toId}-${index}`}
              className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-4 py-2.5 text-sm"
            >
              <span className="text-slate-700">
                <span className="font-medium text-slate-900">
                  {nameOf.get(transfer.fromId) ?? "Unknown"}
                </span>{" "}
                pays{" "}
                <span className="font-medium text-slate-900">
                  {nameOf.get(transfer.toId) ?? "Unknown"}
                </span>
              </span>
              <span className="font-semibold text-slate-900">
                {formatCents(transfer.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
