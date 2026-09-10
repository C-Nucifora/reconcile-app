import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { computeBalances, pendingCents } from "../engine/balances";
import { settle } from "../engine/settle";
import { formatCents } from "../engine/money";
import Icon from "./Icon";

export function SettlePanel() {
  const { activeGroup } = useApp();
  const transfers = useMemo(
    () => (activeGroup ? settle(computeBalances(activeGroup)) : []),
    [activeGroup],
  );
  const nameOf = new Map(
    activeGroup?.people.map((person) => [person.id, person.name]),
  );
  const hasData =
    !!activeGroup?.people.length && !!activeGroup?.expenses.length;
  const pending = activeGroup?.expenses.some(
    (expense) => pendingCents(expense) > 0,
  );
  return (
    <section className="settle-panel">
      <div className="panel-heading">
        <h2>Settle up</h2>
        <Icon name="arrow" size={19} />
      </div>
      <p className="panel-subtitle">Fewer payments. All square.</p>
      {!hasData ? (
        <p className="mt-5 text-xs leading-relaxed text-muted">
          Once you've added expenses, your payment plan will appear here.
        </p>
      ) : pending && transfers.length === 0 ? (
        <p className="mt-5 text-xs leading-relaxed text-warning">
          Assign the remaining receipt items to finish your payment plan.
        </p>
      ) : transfers.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-positive">
          <Icon name="check" /> All settled up.
        </div>
      ) : (
        <>
          {pending && (
            <p className="mt-4 text-xs leading-relaxed text-warning">
              This plan is provisional. Unassigned receipt items are excluded.
            </p>
          )}
          <ul>
            {transfers.map((transfer, index) => (
              <li
                key={`${transfer.fromId}-${transfer.toId}-${index}`}
                className="transfer-row"
              >
                <div className="transfer-people">
                  <strong>{nameOf.get(transfer.fromId) ?? "Unknown"}</strong>
                  <span className="sr-only">pays</span>
                  <Icon name="arrow" size={13} />
                  <strong>{nameOf.get(transfer.toId) ?? "Unknown"}</strong>
                </div>
                <span className="transfer-amount">
                  ${formatCents(transfer.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            {transfers.length} {transfers.length === 1 ? "payment" : "payments"}{" "}
            to settle the group.
          </p>
        </>
      )}
    </section>
  );
}
