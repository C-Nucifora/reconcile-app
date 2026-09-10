import { useState } from "react";
import { useApp } from "../state/AppContext";
import Icon from "./Icon";

export default function GroupSwitcher() {
  const { state, dispatch, activeGroup } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  function handleRename() {
    if (!activeGroup) return;
    const next = window.prompt("Rename group", activeGroup.name)?.trim();
    if (next && next !== activeGroup.name)
      dispatch({ type: "RENAME_GROUP", groupId: activeGroup.id, name: next });
  }
  function handleDelete() {
    if (
      activeGroup &&
      window.confirm(
        `Delete "${activeGroup.name}"? This removes its people and expenses.`,
      )
    )
      dispatch({ type: "DELETE_GROUP", groupId: activeGroup.id });
  }
  return (
    <div className="group-switcher">
      <div className="sidebar-section-title">
        <h2 className="eyebrow">Your groups</h2>
        <span>{state.groups.length.toString().padStart(2, "0")}</span>
      </div>
      <nav className="group-nav" aria-label="Groups">
        {state.groups.map((group, index) => (
          <button
            key={group.id}
            className={`group-link${group.id === state.activeGroupId ? " is-active" : ""}`}
            aria-current={group.id === state.activeGroupId ? "true" : undefined}
            onClick={() =>
              dispatch({ type: "SET_ACTIVE_GROUP", groupId: group.id })
            }
          >
            <span className={`group-monogram group-color-${index % 3}`}>
              {group.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="group-link-name">
              {group.name}
              <small>{group.people.length} people</small>
            </span>
            {group.id === state.activeGroupId && (
              <span className="active-dot" />
            )}
          </button>
        ))}
      </nav>
      {creating ? (
        <form
          className="new-group-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) {
              dispatch({ type: "ADD_GROUP", name: name.trim() });
              setName("");
              setCreating(false);
            }
          }}
        >
          <label htmlFor="group-name" className="eyebrow">
            Group name
          </label>
          <input
            id="group-name"
            autoFocus
            placeholder="e.g. Weekend away"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setCreating(false);
            }}
          />
          <div>
            <button className="button-primary" disabled={!name.trim()}>
              Create group
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel new group"
              onClick={() => setCreating(false)}
            >
              <Icon name="close" />
            </button>
          </div>
        </form>
      ) : (
        <button className="new-group-button" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New group
        </button>
      )}
      {activeGroup && (
        <div className="group-settings">
          <button onClick={handleRename}>Rename group</button>
          <button onClick={handleDelete}>Delete group</button>
        </div>
      )}
    </div>
  );
}
