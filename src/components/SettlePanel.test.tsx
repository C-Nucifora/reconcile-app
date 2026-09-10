import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Group } from "../types";
import { useApp } from "../state/AppContext";
import { SettlePanel } from "./SettlePanel";

vi.mock("../state/AppContext", () => ({ useApp: vi.fn() }));

const group: Group = {
  id: "trip",
  name: "Trip",
  people: [
    { id: "a", name: "Alex" },
    { id: "b", name: "Blair" },
  ],
  expenses: [
    {
      id: "dinner",
      description: "Dinner",
      date: "2026-09-10",
      amountCents: 10000,
      payerId: "a",
      splitType: "equal",
      members: [
        { personId: "a", value: 0 },
        { personId: "b", value: 0 },
      ],
    },
    {
      id: "receipt",
      description: "Receipt",
      date: "2026-09-10",
      amountCents: 500,
      payerId: "a",
      splitType: "equal",
      members: [],
      items: [
        { id: "pending", name: "Coffee", amountCents: 500, assigneeIds: [] },
      ],
    },
  ],
};

function render(activeGroup: Group) {
  vi.mocked(useApp).mockReturnValue({
    activeGroup,
    dispatch: vi.fn(),
    state: {
      groups: [activeGroup],
      activeGroupId: activeGroup.id,
      schemaVersion: 1,
    },
  });
  return renderToStaticMarkup(<SettlePanel />);
}

describe("settlement with pending receipt items", () => {
  it("keeps allocated transfers visible alongside a provisional warning", () => {
    const html = render(group);
    expect(html).toContain("$50.00");
    expect(html).toContain("Blair");
    expect(html).toContain("Alex");
    expect(html).toContain("provisional");
  });
  it("does not claim all settled when only pending items remain", () => {
    const html = render({ ...group, expenses: [group.expenses[1]] });
    expect(html).not.toContain("All settled up.");
    expect(html).toContain("Assign the remaining receipt items");
  });
});
