import type { ID, Expense, AppState } from "../types";

export type Action =
  | { type: "ADD_GROUP"; name: string }
  | { type: "RENAME_GROUP"; groupId: ID; name: string }
  | { type: "DELETE_GROUP"; groupId: ID }
  | { type: "SET_ACTIVE_GROUP"; groupId: ID }
  | { type: "ADD_PERSON"; groupId: ID; name: string }
  | { type: "RENAME_PERSON"; groupId: ID; personId: ID; name: string }
  | { type: "REMOVE_PERSON"; groupId: ID; personId: ID }
  | { type: "ADD_EXPENSE"; groupId: ID; expense: Expense }
  | { type: "UPDATE_EXPENSE"; groupId: ID; expense: Expense }
  | { type: "DELETE_EXPENSE"; groupId: ID; expenseId: ID }
  | { type: "IMPORT_STATE"; state: AppState }
  | { type: "RESET" };
