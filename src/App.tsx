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

function Workspace() {
  const { activeGroup } = useApp();
  const [exportOpen, setExportOpen] = useState(false);

  const canExport = !!activeGroup && activeGroup.people.length > 0;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Reconcile
            </h1>
            <p className="mt-1 text-sm text-muted">
              Track shared expenses and settle up with the fewest payments.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={!canExport}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export PDF
            </button>
            <ThemeToggle />
          </div>
        </header>

        <div className="mt-8">
          <GroupSwitcher />
        </div>

        {activeGroup ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <PeopleManager />
              <ExpenseForm />
              <ExpenseList />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <BalancesPanel />
              <SettlePanel />
            </div>
          </div>
        ) : null}
      </div>

      {exportOpen && activeGroup && (
        <ExportModal group={activeGroup} onClose={() => setExportOpen(false)} />
      )}
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
