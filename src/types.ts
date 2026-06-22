export type ID = string;

export interface Person { id: ID; name: string; }

export type SplitType = "equal" | "exact" | "percent" | "shares";

// value meaning by splitType:
//  equal:   value ignored (each included member counts equally)
//  exact:   value = cents this member owes
//  percent: value = percentage points (members sum to 100)
//  shares:  value = positive integer share count
export interface SplitMember { personId: ID; value: number; }

// A single line item within an itemized expense.
// assigneeIds split the item EQUALLY; [] = unassigned/pending.
export interface ExpenseItem {
  id: ID;
  name: string;
  amountCents: number;
  assigneeIds: ID[];
}

export interface Expense {
  id: ID;
  description: string;
  amountCents: number;   // total expense amount in integer cents
  payerId: ID;           // who actually paid
  date: string;          // ISO yyyy-mm-dd
  splitType: SplitType;
  members: SplitMember[];
  items?: ExpenseItem[];   // present & non-empty => itemized expense; members is [] and splitType "equal" (ignored)
  receiptImageId?: ID;     // reference to an image blob in IndexedDB (may be on any expense)
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
