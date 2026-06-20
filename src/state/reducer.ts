import type { AppState, Group, Person } from "../types";
import type { Action } from "./actions";
import { newId } from "../lib/id";
import { emptyState } from "./storage";

function updateGroup(
  state: AppState,
  groupId: string,
  updater: (group: Group) => Group,
): AppState {
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === groupId ? updater(g) : g)),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_GROUP": {
      const group: Group = {
        id: newId(),
        name: action.name,
        people: [],
        expenses: [],
      };
      return {
        ...state,
        groups: [...state.groups, group],
        activeGroupId: group.id,
      };
    }

    case "RENAME_GROUP": {
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        name: action.name,
      }));
    }

    case "DELETE_GROUP": {
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      let activeGroupId = state.activeGroupId;
      if (activeGroupId === action.groupId) {
        activeGroupId = groups.length > 0 ? groups[0].id : null;
      }
      return { ...state, groups, activeGroupId };
    }

    case "SET_ACTIVE_GROUP": {
      return { ...state, activeGroupId: action.groupId };
    }

    case "ADD_PERSON": {
      const person: Person = { id: newId(), name: action.name };
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        people: [...g.people, person],
      }));
    }

    case "RENAME_PERSON": {
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        people: g.people.map((p) =>
          p.id === action.personId ? { ...p, name: action.name } : p,
        ),
      }));
    }

    case "REMOVE_PERSON": {
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        people: g.people.filter((p) => p.id !== action.personId),
      }));
    }

    case "ADD_EXPENSE": {
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        expenses: [...g.expenses, action.expense],
      }));
    }

    case "UPDATE_EXPENSE": {
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        expenses: g.expenses.map((e) =>
          e.id === action.expense.id ? action.expense : e,
        ),
      }));
    }

    case "DELETE_EXPENSE": {
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        expenses: g.expenses.filter((e) => e.id !== action.expenseId),
      }));
    }

    case "IMPORT_STATE": {
      return action.state;
    }

    case "RESET": {
      return emptyState();
    }

    default:
      return state;
  }
}
