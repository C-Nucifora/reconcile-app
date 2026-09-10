import { useState } from "react";
import { AppProvider, useApp } from "./state/AppContext";
import GroupSwitcher from "./components/GroupSwitcher";
import PeopleManager from "./components/PeopleManager";
import ExpenseForm from "./components/ExpenseForm";
import ExpenseList from "./components/ExpenseList";
import { BalancesPanel } from "./components/BalancesPanel";
import { SettlePanel } from "./components/SettlePanel";
import ThemeToggle from "./components/ThemeToggle";
import ExportModal from "./components/ExportModal";
import Dialog from "./components/Dialog";
import Icon from "./components/Icon";
import { expenseTotalCents, pendingCents } from "./engine/balances";
import { formatCents } from "./engine/money";

function GroupWorkspace() {
  const { activeGroup } = useApp();
  const [exportOpen, setExportOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  if (!activeGroup) return null;
  const total = activeGroup.expenses.reduce(
    (sum, expense) => sum + expenseTotalCents(expense),
    0,
  );
  const pending = activeGroup.expenses.reduce(
    (sum, expense) => sum + pendingCents(expense),
    0,
  );
  const count = activeGroup.expenses.length;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your shared ledger</p>
          <h1>{activeGroup.name}</h1>
          <p className="page-description">
            Good times. Everything accounted for.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button-secondary"
            onClick={() => setExportOpen(true)}
            disabled={!activeGroup.people.length}
          >
            <Icon name="download" /> Export PDF
          </button>
          <button
            className="button-primary"
            onClick={() => setExpenseOpen(true)}
            disabled={!activeGroup.people.length}
          >
            <Icon name="plus" /> Add expense
          </button>
        </div>
      </div>
      <section className="summary-grid" aria-label="Group overview">
        <div className="summary-main">
          <div className="summary-label">
            <span>Total shared spending</span>
            <Icon name="receipt" />
          </div>
          <p className="summary-amount">${formatCents(total)}</p>
          <p className="summary-note">
            {count
              ? `Across ${count} ${count === 1 ? "expense" : "expenses"}`
              : "Your next shared moment starts here"}
          </p>
          <div className="summary-decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="summary-stat">
          <span className="eyebrow">The group</span>
          <p>
            {activeGroup.people.length.toString().padStart(2, "0")}
            <span>people</span>
          </p>
          <span className="text-muted text-xs">Sharing the costs</span>
        </div>
        <div className="summary-stat">
          <span className="eyebrow">Unallocated</span>
          <p className={pending > 0 ? "text-warning" : ""}>
            ${formatCents(pending)}
          </p>
          <span className="text-muted text-xs">
            {pending > 0
              ? "Assign the remaining receipt items"
              : "No unassigned receipt items"}
          </span>
        </div>
      </section>
      <div className="workspace-grid">
        <div className="ledger-column">
          <section className="ledger-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">The details</p>
                <h2>
                  Expenses <span className="count-badge">{count}</span>
                </h2>
              </div>
              <span className="section-meta">Newest first</span>
            </div>
            <ExpenseList onAdd={() => setExpenseOpen(true)} />
          </section>
          <PeopleManager />
        </div>
        <aside className="balance-column">
          <BalancesPanel />
          <SettlePanel />
          <p className="settlement-note">
            <Icon name="lock" size={13} /> Your group data stays in this
            browser.
          </p>
        </aside>
      </div>
      {expenseOpen && (
        <Dialog
          title="Record an expense"
          onClose={() => setExpenseOpen(false)}
          wide
        >
          <ExpenseForm onDone={() => setExpenseOpen(false)} />
        </Dialog>
      )}
      {exportOpen && (
        <ExportModal group={activeGroup} onClose={() => setExportOpen(false)} />
      )}
    </>
  );
}

function Workspace() {
  const { activeGroup } = useApp();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="#workspace">
          <span className="brand-mark" aria-hidden="true">
            r<span>.</span>
          </span>
          reconcile<span className="brand-dot">.</span>
        </a>
        <p className="brand-caption">A little less owing.</p>
        <GroupSwitcher />
        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>Just here. Just yours.</span>
          <p>No accounts. No awkward maths.</p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="grid" size={15} />
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{activeGroup?.name ?? "Welcome"}</strong>
          </div>
          <ThemeToggle />
        </header>
        <main id="workspace" className="workspace" tabIndex={-1}>
          {activeGroup ? (
            <GroupWorkspace key={activeGroup.id} />
          ) : (
            <section className="welcome">
              <span className="welcome-symbol" aria-hidden="true">
                <Icon name="receipt" size={42} />
              </span>
              <p className="eyebrow">Money between friends, sorted</p>
              <h1>
                Share the moment.
                <br />
                <em>Split the cost.</em>
              </h1>
              <p>
                Trips, dinners, and the everyday things you share.
                <br />
                Create a group to keep track of who paid what.
              </p>
              <div className="welcome-steps">
                <span>
                  <b>01</b> Create a group
                </span>
                <span>
                  <b>02</b> Add your people
                </span>
                <span>
                  <b>03</b> Settle up
                </span>
              </div>
            </section>
          )}
        </main>
        <footer className="workspace-footer">
          <span>Made for the things you share.</span>
          <span>Reconcile</span>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Workspace />
    </AppProvider>
  );
}
