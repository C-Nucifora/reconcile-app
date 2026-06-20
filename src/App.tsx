import { AppProvider, useApp } from "./state/AppContext";
import GroupSwitcher from "./components/GroupSwitcher";
import PeopleManager from "./components/PeopleManager";
import ExpenseForm from "./components/ExpenseForm";
import ExpenseList from "./components/ExpenseList";
import { BalancesPanel } from "./components/BalancesPanel";
import { SettlePanel } from "./components/SettlePanel";

function Workspace() {
  const { activeGroup } = useApp();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reconcile
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track shared expenses and settle up with the fewest payments.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <GroupSwitcher />
        </div>

        {activeGroup ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
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
      </main>
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
