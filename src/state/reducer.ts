import type { AppState, Expense, Group, Person } from "../types";
import type { Action } from "./actions";
import { newId } from "../lib/id";
import { emptyState, sanitizeState } from "./storage";

/**
 * Remove a person from a single expense.
 *
 * - If they were the payer, the expense can no longer be attributed and is
 *   dropped (both itemized and non-itemized).
 * - Itemized expense: the person is stripped from every item's assigneeIds. An
 *   item that loses all assignees becomes pending — it is kept, not deleted.
 *   The expense itself survives as long as the removed person was not the payer.
 * - Non-itemized expense: the person is removed from the member list. An expense
 *   whose only member was the removed person is dropped. For an exact split the
 *   removed member's cents are not redistributed (the amount/members no longer
 *   match by design); the engine reconciles the remaining members back to the
 *   total. Percent/shares/equal keep their remaining weights and are re-split by
 *   the engine.
 *
 * Returns the cleaned expense, or null when it should be dropped entirely.
 */
function removePersonFromExpense(
  expense: Expense,
  personId: string,
): Expense | null {
  if (expense.payerId === personId) return null;

  if (expense.items && expense.items.length > 0) {
    let changed = false;
    const items = expense.items.map((item) => {
      if (!item.assigneeIds.includes(personId)) return item;
      changed = true;
      return {
        ...item,
        assigneeIds: item.assigneeIds.filter((id) => id !== personId),
      };
    });
    if (!changed) return expense;
    return { ...expense, items };
  }

  const members = expense.members.filter((m) => m.personId !== personId);
  if (members.length === 0) return null;
  if (members.length === expense.members.length) return expense;

  return { ...expense, members };
}

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
        // Purge the person from every expense so they can never reappear as a
        // ghost row in Balances or an "Unknown" party in Settle.
        expenses: g.expenses
          .map((e) => removePersonFromExpense(e, action.personId))
          .filter((e): e is Expense => e !== null),
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
      // Never trust imported data; sanitize it so the engine's invariants hold.
      return sanitizeState(action.state);
    }

    case "RESET": {
      return emptyState();
    }

    default:
      return state;
  }
}
