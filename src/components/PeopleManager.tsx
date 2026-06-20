import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext";
import type { Person } from "../types";

export default function PeopleManager() {
  const { activeGroup, dispatch } = useApp();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // personId -> whether they appear in any expense of the active group.
  const involvedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeGroup) return ids;
    for (const expense of activeGroup.expenses) {
      ids.add(expense.payerId);
      for (const m of expense.members) ids.add(m.personId);
    }
    return ids;
  }, [activeGroup]);

  if (!activeGroup) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">
          Create or select a group to start adding people.
        </p>
      </div>
    );
  }

  const groupId = activeGroup.id;
  const people = activeGroup.people;

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: "ADD_PERSON", groupId, name });
    setNewName("");
  }

  function startEditing(person: Person) {
    setEditingId(person.id);
    setEditName(person.name);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
  }

  function commitEditing(person: Person) {
    const name = editName.trim();
    if (name && name !== person.name) {
      dispatch({ type: "RENAME_PERSON", groupId, personId: person.id, name });
    }
    cancelEditing();
  }

  function handleRemove(person: Person) {
    if (involvedIds.has(person.id)) {
      const ok = window.confirm(
        `${person.name} appears in one or more expenses in this group. ` +
          `Removing them will not delete those expenses, but it may leave balances that no longer add up. ` +
          `Remove anyway?`,
      );
      if (!ok) return;
    }
    if (editingId === person.id) cancelEditing();
    dispatch({ type: "REMOVE_PERSON", groupId, personId: person.id });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">People</h2>
        <span className="text-xs text-slate-400">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      </div>

      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a person by name"
          aria-label="Person name"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Add
        </button>
      </form>

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm text-slate-500">
            No people yet. Add someone above to get started.
          </p>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {people.map((person) => {
            const isEditing = editingId === person.id;
            return (
              <li key={person.id}>
                {isEditing ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-2 pr-1">
                    <input
                      type="text"
                      value={editName}
                      autoFocus
                      aria-label={`Rename ${person.name}`}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEditing(person);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditing();
                        }
                      }}
                      onBlur={() => commitEditing(person)}
                      className="w-28 min-w-0 bg-transparent px-1 text-sm text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commitEditing(person)}
                      aria-label="Save name"
                      className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 10.5l4 4 8-9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </span>
                ) : (
                  <span className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-sm text-slate-700">
                    <button
                      type="button"
                      onClick={() => startEditing(person)}
                      title="Rename"
                      className="max-w-[12rem] truncate font-medium text-slate-700 transition hover:text-slate-900"
                    >
                      {person.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(person)}
                      aria-label={`Remove ${person.name}`}
                      title={`Remove ${person.name}`}
                      className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 5l10 10M15 5L5 15"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
