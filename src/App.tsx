import { AppProvider, useApp } from "./state/AppContext";
import GroupSwitcher from "./components/GroupSwitcher";
import PeopleManager from "./components/PeopleManager";
import ExpenseForm from "./components/ExpenseForm";
import ExpenseList from "./components/ExpenseList";
import { BalancesPanel } from "./components/BalancesPanel";
import { SettlePanel } from "./components/SettlePanel";
import ThemeToggle from "./components/ThemeToggle";

function Workspace() {
  const { activeGroup } = useApp();

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
          <ThemeToggle />
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
