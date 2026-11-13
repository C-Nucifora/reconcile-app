import type { AppState, Expense, Group, Person } from "../types";
import type { Action } from "./actions";
import { newId } from "../lib/id";
import { assertStorageBounds, emptyState, validateState } from "./storage";
import { computeExpenseShares } from "../engine/balances";

/**
 * Remove a person from a single expense.
 *
 * - If they were the payer, the expense can no longer be attributed and is
 *   dropped (both itemized and non-itemized).
 * - Itemized expense: the person is stripped from every item's assigneeIds. An
 *   item that loses all assignees becomes pending — it is kept, not deleted.
 *   The expense itself survives as long as the removed person was not the payer.
 * - Non-itemized expense: the person is removed from the member list. An expense
 *   whose only member was the removed person is dropped. Exact splits redistribute
 *   the total across remaining members, matching the engine.
 *   Percent/shares/equal keep their remaining weights and are re-split by
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

  if (expense.splitType === "exact") {
    const shares = computeExpenseShares({ ...expense, members });
    return { ...expense, members: members.map((member) => ({ ...member, value: shares.get(member.personId)! })) };
  }
  return { ...expense, members };
}

function updateGroup(
  state: AppState,
  groupId: string,
  updater: (group: Group) => Group,
): AppState {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return state;
  const next = updater(group);
  return next === group ? state : { ...state, groups: state.groups.map((g) => g === group ? next : g) };
}

export function reducer(state: AppState, action: Action): AppState {
  const next = reduce(state, action);
  if (next === state) return state;
  try {
    assertStorageBounds(next);
    return next;
  } catch {
    return state;
  }
}

function reduce(state: AppState, action: Action): AppState {
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
      return updateGroup(state, action.groupId, (g) => g.name === action.name ? g : ({
        ...g,
        name: action.name,
      }));
    }

    case "DELETE_GROUP": {
      if (!state.groups.some((g) => g.id === action.groupId)) return state;
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      let activeGroupId = state.activeGroupId;
      if (activeGroupId === action.groupId) {
        activeGroupId = groups.length > 0 ? groups[0].id : null;
      }
      return { ...state, groups, activeGroupId };
    }

    case "SET_ACTIVE_GROUP": {
      return state.activeGroupId !== action.groupId && state.groups.some((g) => g.id === action.groupId)
        ? { ...state, activeGroupId: action.groupId }
        : state;
    }

    case "ADD_PERSON": {
      const person: Person = { id: newId(), name: action.name };
      return updateGroup(state, action.groupId, (g) => ({
        ...g,
        people: [...g.people, person],
      }));
    }

    case "RENAME_PERSON": {
      return updateGroup(state, action.groupId, (g) => {
        const person = g.people.find((p) => p.id === action.personId);
        if (!person || person.name === action.name) return g;
        return {
          ...g,
          people: g.people.map((p) => p === person ? { ...p, name: action.name } : p),
        };
      });
    }

    case "REMOVE_PERSON": {
      return updateGroup(state, action.groupId, (g) => !g.people.some((p) => p.id === action.personId) ? g : ({
        ...g,
        people: g.people.filter((p) => p.id !== action.personId),
        // Purge the person from every expense so they can never reappear as a
        // ghost row in Balances or an "Unknown" party in Settle.
        expenses: g.expenses
          .map((e) => removePersonFromExpense(e, action.personId))
          .filter((e): e is Expense => e !== null),
      }));
    }

    case "ADD_EXPENSE":
    case "UPDATE_EXPENSE": {
      return updateGroup(state, action.groupId, (g) => {
        if (action.type === "ADD_EXPENSE" && g.expenses.some((e) => e.id === action.expense.id)) return g;
        if (action.type === "UPDATE_EXPENSE" && !g.expenses.some((e) => e.id === action.expense.id)) return g;
        let cleaned: Expense;
        try {
          cleaned = validateState({ groups: [{ ...g, expenses: [action.expense] }], activeGroupId: g.id, schemaVersion: 1 }).groups[0].expenses[0];
        } catch { return g; }
        const expenses = action.type === "ADD_EXPENSE"
          ? [...g.expenses, cleaned]
          : g.expenses.map((e) => e.id === cleaned.id ? cleaned : e);
        if (!Number.isSafeInteger(expenses.reduce((sum, expense) => sum + expense.amountCents, 0))) return g;
        return { ...g, expenses };
      });
    }

    case "DELETE_EXPENSE": {
      return updateGroup(state, action.groupId, (g) => !g.expenses.some((e) => e.id === action.expenseId) ? g : ({
        ...g,
        expenses: g.expenses.filter((e) => e.id !== action.expenseId),
      }));
    }

    case "IMPORT_STATE": {
      // Reject damaged imports without silently changing the user's allocations.
      try {
        return validateState(action.state);
      } catch {
        return state;
      }
    }

    case "RESET": {
      return emptyState();
    }

    default:
      return state;
  }
}
