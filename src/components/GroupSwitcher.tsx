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
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center shadow-sm">
        <h2 className="text-base font-semibold text-fg">No groups yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Create your first group to start splitting expenses with friends,
          roommates, or travel companions.
        </p>
        <button
          type="button"
          onClick={handleNewGroup}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-sm transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Create your first group
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
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
                    "max-w-[12rem] truncate rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
                    (isActive
                      ? "bg-accent text-accent-fg shadow-sm"
                      : "text-muted hover:bg-surface-2")
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
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-negative transition hover:bg-negative-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleNewGroup}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg shadow-sm transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            + New group
          </button>
        </div>
      </div>
    </div>
  );
}
