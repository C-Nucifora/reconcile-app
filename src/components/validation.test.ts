import { describe, expect, it } from "vitest";
import { isSplitValid, areItemsValid, type ItemDraft } from "./expenseValidation";

const members = (a: number, b: number) => [
  { personId: "alex", value: a },
  { personId: "sam", value: b },
];

describe("expense editor validation", () => {
  it("rejects exact splits that cancel negative allocations", () => {
    expect(isSplitValid(100, "exact", members(-100, 200))).toBe(false);
    expect(isSplitValid(100, "exact", members(0.5, 99.5))).toBe(false);
    expect(isSplitValid(100, "exact", members(40, 60))).toBe(true);
  });

  it("rejects invalid totals and nonfinite or negative weights in every mode", () => {
    for (const mode of ["equal", "exact", "percent", "shares"] as const) {
      for (const invalid of [NaN, Infinity, -Infinity, -1]) {
        expect(isSplitValid(100, mode, members(invalid, 100))).toBe(false);
      }
      expect(isSplitValid(Number.MAX_SAFE_INTEGER + 1, mode, members(50, 50))).toBe(false);
    }
    expect(isSplitValid(100, "percent", members(-10, 110))).toBe(false);
    expect(isSplitValid(100, "shares", members(1, Infinity))).toBe(false);
    expect(isSplitValid(100, "shares", members(1, 0))).toBe(false);
    expect(isSplitValid(100, "shares", members(0.5, 1.5))).toBe(false);
    expect(isSplitValid(100, "shares", members(1, Number.MAX_SAFE_INTEGER + 1))).toBe(false);
    expect(isSplitValid(100, "shares", members(1, 2))).toBe(true);
  });

  it("requires unique participants", () => {
    expect(isSplitValid(100, "equal", [
      { personId: "alex", value: 0 }, { personId: "alex", value: 0 },
    ])).toBe(false);
  });

  it("requires complete exact and percentage allocations", () => {
    expect(isSplitValid(100, "exact", members(40, 59))).toBe(false);
    expect(isSplitValid(100, "percent", members(40, 59))).toBe(false);
    expect(isSplitValid(100, "percent", members(33.25, 66.75))).toBe(true);
    expect(isSplitValid(100, "percent", members(100.01, 0))).toBe(false);
    expect(isSplitValid(100, "equal", [])).toBe(false);
  });

  it("checks percentage totals without floating point summation errors", () => {
    const percentageMembers = (values: number[]) => values.map((value, index) => ({ personId: `p${index}`, value }));
    expect(isSplitValid(101, "percent", percentageMembers([0.01, 64.04, 35.95]))).toBe(true);
    expect(isSplitValid(101, "percent", percentageMembers([99.99999999999999]))).toBe(false);
  });

  it("rejects itemized totals beyond safe integer cents and preserves pending items", () => {
    const item = (id: string, priceInput: string): ItemDraft => ({
      id, name: "Fictional groceries", priceInput, assigneeIds: [],
    });
    expect(areItemsValid([item("a", "1.00")])).toBe(true);
    expect(areItemsValid([item("a", "45035996273704.96"), item("b", "45035996273704.96")])).toBe(false);
    expect(areItemsValid([item("a", "0"), item("b", "1.00")])).toBe(false);
    expect(areItemsValid([item("a", "-1.00")])).toBe(false);
    expect(areItemsValid([item("a", "90071992547409.91")])).toBe(true);
    expect(areItemsValid([item("a", "90071992547409.91"), item("b", "0.01")])).toBe(false);
    expect(areItemsValid([{ ...item("a", ""), name: "" }, item("b", "1.00")])).toBe(true);
    expect(areItemsValid([{ ...item("a", "1.00"), name: "" }])).toBe(false);
    expect(areItemsValid([{ ...item("a", "1.00"), name: "x".repeat(10_001) }])).toBe(false);
    expect(areItemsValid([{ ...item("a", "1.00"), name: "x".repeat(10_000) }])).toBe(true);
  });
});
