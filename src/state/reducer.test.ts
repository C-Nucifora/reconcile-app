import { describe, it, expect } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Group } from "../types";

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
});

describe("IMPORT_STATE", () => {
  it("sanitizes imported state, dropping expenses with unknown members", () => {
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

    const next = reducer(
      { groups: [], activeGroupId: null, schemaVersion: 1 },
      { type: "IMPORT_STATE", state: dirty },
    );
    const g = next.groups[0];
    // e1 kept but its unknown member stripped; e2 dropped (unknown payer).
    expect(g.expenses).toHaveLength(1);
    expect(g.expenses[0].id).toBe("e1");
    expect(g.expenses[0].members.map((m) => m.personId)).toEqual(["A"]);
  });
});
