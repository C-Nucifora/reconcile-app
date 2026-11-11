import { describe, it, expect } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Group } from "../types";
import { validateState } from "./storage";

function stateWith(group: Group): AppState {
  return { groups: [group], activeGroupId: group.id, schemaVersion: 1 };
}

describe("REMOVE_PERSON", () => {
  it("drops the person from member lists of expenses", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
      ],
      expenses: [
        {
          id: "e1",
          description: "dinner",
          amountCents: 3000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [
            { personId: "A", value: 0 },
            { personId: "B", value: 0 },
            { personId: "C", value: 0 },
          ],
        },
      ],
    };
    const next = reducer(stateWith(group), {
      type: "REMOVE_PERSON",
      groupId: "g",
      personId: "C",
    });
    const g = next.groups[0];
    expect(g.people.map((p) => p.id)).toEqual(["A", "B"]);
    const memberIds = g.expenses[0].members.map((m) => m.personId);
    expect(memberIds).toEqual(["A", "B"]);
  });

  it("deletes expenses paid by the removed person", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "paid by A",
          amountCents: 1000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [
            { personId: "A", value: 0 },
            { personId: "B", value: 0 },
          ],
        },
      ],
    };
    const next = reducer(stateWith(group), {
      type: "REMOVE_PERSON",
      groupId: "g",
      personId: "A",
    });
    expect(next.groups[0].expenses).toHaveLength(0);
  });

  it("deletes an expense whose only member was the removed person", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "solo",
          amountCents: 1000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "exact",
          members: [{ personId: "B", value: 1000 }],
        },
      ],
    };
    const next = reducer(stateWith(group), {
      type: "REMOVE_PERSON",
      groupId: "g",
      personId: "B",
    });
    expect(next.groups[0].expenses).toHaveLength(0);
  });

  it("strips the person from item assignees on an itemized expense", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
      ],
      expenses: [
        {
          id: "e1",
          description: "groceries",
          amountCents: 3000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [],
          items: [
            { id: "i1", name: "milk", amountCents: 1000, assigneeIds: ["B", "C"] },
            { id: "i2", name: "bread", amountCents: 2000, assigneeIds: ["C"] },
          ],
        },
      ],
    };
    const next = reducer(stateWith(group), {
      type: "REMOVE_PERSON",
      groupId: "g",
      personId: "C",
    });
    const e = next.groups[0].expenses;
    // Expense survives (C was not the payer); C stripped from both items.
    expect(e).toHaveLength(1);
    expect(e[0].items?.[0].assigneeIds).toEqual(["B"]);
    // Item that loses all assignees becomes pending but is kept, not deleted.
    expect(e[0].items?.[1].assigneeIds).toEqual([]);
    expect(e[0].items).toHaveLength(2);
  });

  it("deletes an itemized expense paid by the removed person", () => {
    const group: Group = {
      id: "g",
      name: "g",
      people: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      expenses: [
        {
          id: "e1",
          description: "groceries",
          amountCents: 1000,
          payerId: "A",
          date: "2026-01-01",
          splitType: "equal",
          members: [],
          items: [
            { id: "i1", name: "milk", amountCents: 1000, assigneeIds: ["B"] },
          ],
        },
      ],
    };
    const next = reducer(stateWith(group), {
      type: "REMOVE_PERSON",
      groupId: "g",
      personId: "A",
    });
    expect(next.groups[0].expenses).toHaveLength(0);
  });
});

describe("IMPORT_STATE", () => {
  it("rejects an import with unknown people without replacing existing data", () => {
    const dirty = {
      groups: [
        {
          id: "g",
          name: "g",
          people: [{ id: "A", name: "A" }],
          expenses: [
            {
              id: "e1",
              description: "ghost member",
              amountCents: 1000,
              payerId: "A",
              date: "2026-01-01",
              splitType: "equal",
              members: [
                { personId: "A", value: 0 },
                { personId: "ZZZ", value: 0 },
              ],
            },
            {
              id: "e2",
              description: "unknown payer",
              amountCents: 1000,
              payerId: "ZZZ",
              date: "2026-01-01",
              splitType: "equal",
              members: [{ personId: "A", value: 0 }],
            },
          ],
        },
      ],
      activeGroupId: "g",
      schemaVersion: 1,
    } as unknown as AppState;

    const original = stateWith({ id: "existing", name: "Fictional group", people: [], expenses: [] });
    expect(reducer(original, { type: "IMPORT_STATE", state: dirty })).toBe(original);
    expect(dirty.groups[0].expenses).toHaveLength(2);
  });

  it("requires explicit correction of unknown item assignees before importing", () => {
    const dirty = {
      groups: [
        {
          id: "g",
          name: "g",
          people: [
            { id: "A", name: "A" },
            { id: "B", name: "B" },
          ],
          expenses: [
            {
              id: "e1",
              description: "itemized",
              amountCents: 3000,
              payerId: "A",
              date: "2026-01-01",
              splitType: "equal",
              members: [],
              receiptImageId: "img-1",
              items: [
                {
                  id: "i1",
                  name: "milk",
                  amountCents: 1000,
                  // ZZZ is unknown and must be stripped; B is kept.
                  assigneeIds: ["B", "ZZZ"],
                },
                {
                  id: "i2",
                  name: "bread",
                  amountCents: 2000,
                  // Loses its only (unknown) assignee -> pending, but kept.
                  assigneeIds: ["ZZZ"],
                },
              ],
            },
          ],
        },
      ],
      activeGroupId: "g",
      schemaVersion: 1,
    } as unknown as AppState;

    const original = stateWith({ id: "existing", name: "Fictional group", people: [], expenses: [] });
    expect(reducer(original, { type: "IMPORT_STATE", state: dirty })).toBe(original);
    dirty.groups[0].expenses[0].items![0].assigneeIds = ["B"];
    dirty.groups[0].expenses[0].items![1].assigneeIds = [];
    const next = reducer(original, { type: "IMPORT_STATE", state: dirty });
    const e = next.groups[0].expenses;
    expect(e).toHaveLength(1);
    expect(e[0].id).toBe("e1");
    // Itemized expense kept; members normalized to empty.
    expect(e[0].members).toEqual([]);
    expect(e[0].items).toHaveLength(2);
    expect(e[0].items?.[0].assigneeIds).toEqual(["B"]);
    expect(e[0].items?.[1].assigneeIds).toEqual([]);
    // String receiptImageId preserved.
    expect(e[0].receiptImageId).toBe("img-1");
  });
});

it("keeps exact splits durable after removing a member", () => {
  const group: Group = {
    id: "g", name: "Fictional trip",
    people: [{ id: "A", name: "Alex" }, { id: "B", name: "Blair" }, { id: "C", name: "Casey" }],
    expenses: [{ id: "e", description: "Fictional dinner", amountCents: 101, payerId: "A", date: "2026-01-01", splitType: "exact", members: [
      { personId: "A", value: 10 }, { personId: "B", value: 80 }, { personId: "C", value: 11 },
    ] }],
  };
  const next = reducer(stateWith(group), { type: "REMOVE_PERSON", groupId: "g", personId: "C" });
  expect(next.groups[0].expenses[0].members).toEqual([{ personId: "A", value: 16 }, { personId: "B", value: 85 }]);
  expect(validateState(JSON.parse(JSON.stringify(next)))).toEqual(next);
  expect(reducer(next, { type: "REMOVE_PERSON", groupId: "g", personId: "C" })).toBe(next);
});
