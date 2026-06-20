export type ID = string;

export interface Person { id: ID; name: string; }

export type SplitType = "equal" | "exact" | "percent" | "shares";

// value meaning by splitType:
//  equal:   value ignored (each included member counts equally)
//  exact:   value = cents this member owes
//  percent: value = percentage points (members sum to 100)
//  shares:  value = positive integer share count
export interface SplitMember { personId: ID; value: number; }

export interface Expense {
  id: ID;
  description: string;
  amountCents: number;   // total expense amount in integer cents
  payerId: ID;           // who actually paid
  date: string;          // ISO yyyy-mm-dd
  splitType: SplitType;
  members: SplitMember[];
}

export interface Group {
  id: ID;
  name: string;
  people: Person[];
  expenses: Expense[];
}

export interface AppState {
  groups: Group[];
  activeGroupId: ID | null;
  schemaVersion: number;
}

export interface Transfer { fromId: ID; toId: ID; amountCents: number; }
