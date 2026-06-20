import { useApp } from "../state/AppContext";

export default function GroupSwitcher() {
  const { state, dispatch, activeGroup } = useApp();
  const { groups } = state;

  function handleNewGroup() {
    const name = window.prompt("Name your group")?.trim();
    if (name) {
      dispatch({ type: "ADD_GROUP", name });
    }
  }

  function handleRename() {
    if (!activeGroup) return;
    const name = window.prompt("Rename group", activeGroup.name)?.trim();
    if (name && name !== activeGroup.name) {
      dispatch({ type: "RENAME_GROUP", groupId: activeGroup.id, name });
    }
  }

  function handleDelete() {
    if (!activeGroup) return;
    const ok = window.confirm(
      `Delete "${activeGroup.name}"? This removes its people and expenses.`
    );
    if (ok) {
      dispatch({ type: "DELETE_GROUP", groupId: activeGroup.id });
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          No groups yet
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Create your first group to start splitting expenses with friends,
          roommates, or travel companions.
        </p>
        <button
          type="button"
          onClick={handleNewGroup}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Create your first group
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Groups">
            {groups.map((group) => {
              const isActive = group.id === state.activeGroupId;
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() =>
                    dispatch({ type: "SET_ACTIVE_GROUP", groupId: group.id })
                  }
                  className={
                    "max-w-[12rem] truncate rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 " +
                    (isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                  }
                  title={group.name}
                >
                  {group.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {activeGroup && (
            <>
              <button
                type="button"
                onClick={handleRename}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleNewGroup}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            + New group
          </button>
        </div>
      </div>
    </div>
  );
}
