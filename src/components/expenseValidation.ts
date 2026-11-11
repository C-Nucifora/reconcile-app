import type { ID, SplitMember, SplitType } from "../types";
import { parseAmountToCents } from "../engine/money";
import { newId } from "../lib/id";
import { MAX_TEXT_LENGTH } from "../state/storage";

// A single editable row. priceInput is the raw text the user types; the parsed
// cents value is derived for totals/validity. assigneeIds split the item
// equally — an empty array means the row is pending (unallocated).
export interface ItemDraft {
  id: ID;
  name: string;
  priceInput: string;
  assigneeIds: ID[];
}

export function emptyItemDraft(): ItemDraft {
  return { id: newId(), name: "", priceInput: "", assigneeIds: [] };
}

/** Cents for a single draft row, or null when the price is blank/invalid. */
export function itemCents(item: ItemDraft): number | null {
  if (item.priceInput.trim() === "") return null;
  return parseAmountToCents(item.priceInput);
}

/**
 * Whether the set of item drafts is valid to save: at least one row has a
 * non-empty name and a positive, parseable price, and no row carries a
 * name/price that fails to parse. A pending (unassigned) row is allowed.
 */
export function areItemsValid(items: ItemDraft[]): boolean {
  let hasOneGood = false;
  let total = 0;
  for (const item of items) {
    const name = item.name.trim();
    const priceText = item.priceInput.trim();
    const cents = itemCents(item);

    // A row with text in either field must parse to a positive priced, named
    // line; a fully-blank row is simply ignored.
    const blank = name === "" && priceText === "";
    if (blank) continue;

    if (name === "" || name.length > MAX_TEXT_LENGTH || cents === null || cents <= 0) return false;
    total += cents;
    if (!Number.isSafeInteger(total)) return false;
    hasOneGood = true;
  }
  return hasOneGood;
}

/**
 * Pure validity check for a split. Shared by SplitEditor's inline message
 * and by ExpenseForm to decide whether submit is enabled.
 */
export function isSplitValid(
  amountCents: number,
  splitType: SplitType,
  members: SplitMember[],
): boolean {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || members.length === 0) return false;
  if (new Set(members.map((m) => m.personId)).size !== members.length) return false;
  if (members.some((m) => !Number.isFinite(m.value) || m.value < 0)) return false;
  if (splitType === "exact" && members.some((m) => !Number.isSafeInteger(m.value))) return false;
  if (splitType === "percent" && members.some((m) => m.value > 100)) return false;
  if (splitType === "exact") {
    return members.reduce((acc, m) => acc + m.value, 0) === amountCents;
  }
  if (splitType === "percent") {
    const decimals = members.map(({ value }) => {
      const [coefficient, exponent = "0"] = value.toString().split("e");
      const [whole, fraction = ""] = coefficient.split(".");
      return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
    });
    const scale = Math.max(0, ...decimals.map((decimal) => decimal.scale));
    return decimals.reduce((sum, decimal) => sum + decimal.digits * 10n ** BigInt(scale - decimal.scale), 0n) === 100n * 10n ** BigInt(scale);
  }
  if (splitType === "shares") {
    return members.every((m) => Number.isSafeInteger(m.value) && m.value > 0);
  }
  return true; // equal
}
