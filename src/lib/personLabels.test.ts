import { describe, expect, it } from "vitest";
import { personLabels } from "./personLabels";

describe("personLabels", () => {
  it("leaves unique names unchanged and handles an empty group", () => {
    expect([...personLabels([])]).toEqual([]);
    expect([...personLabels([
      { id: "a", name: "Alex" },
      { id: "b", name: "Blair" },
    ])]).toEqual([["a", "Alex"], ["b", "Blair"]]);
  });

  it("distinguishes duplicate names in people-list order by their existing IDs", () => {
    const people = [
      { id: "b", name: "Alex" },
      { id: "c", name: "Blair" },
      { id: "a", name: "Alex" },
      { id: "d", name: "Alex" },
    ];
    expect([...personLabels(people)]).toEqual([
      ["b", "Alex (1)"], ["c", "Blair"], ["a", "Alex (2)"], ["d", "Alex (3)"],
    ]);
    expect([...personLabels(people.filter((person) => person.id === "a"))])
      .toEqual([["a", "Alex"]]);
  });

  it("avoids raw names anywhere in the list and other generated labels", () => {
    const labels = personLabels([
      { id: "a", name: "Alex" },
      { id: "b", name: "Alex" },
      { id: "c", name: "Alex (1)" },
      { id: "d", name: "Alex (2)" },
      { id: "e", name: "Alex (2)" },
      { id: "f", name: "Alex (2) (1)" },
      { id: "g", name: "Alex (4)" },
    ]);
    expect([...labels.values()]).toEqual([
      "Alex (3)", "Alex (5)", "Alex (1)", "Alex (2) (2)",
      "Alex (2) (3)", "Alex (2) (1)", "Alex (4)",
    ]);
    expect(new Set(labels.values()).size).toBe(labels.size);
  });

  it("preserves raw Unicode and untrusted text without mutating people", () => {
    const raw = '  李 👩🏽‍🚀 <script> & "  ';
    const people = Object.freeze([
      Object.freeze({ id: "a", name: raw }),
      Object.freeze({ id: "b", name: raw }),
      Object.freeze({ id: "c", name: "é" }),
      Object.freeze({ id: "d", name: "e\u0301" }),
    ]);
    const before = JSON.stringify(people);
    expect([...personLabels(people).values()]).toEqual([
      `${raw} (1)`, `${raw} (2)`, "é (1)", "e\u0301 (2)",
    ]);
    expect(JSON.stringify(people)).toBe(before);
  });

  it("disambiguates canonical Unicode equivalents and reserves equivalent literal suffixes", () => {
    const labels = personLabels([
      { id: "a", name: "é" }, { id: "b", name: "e\u0301" },
      { id: "c", name: "é (1)" },
    ]);
    expect([...labels.values()]).toEqual(["é (2)", "e\u0301 (3)", "é (1)"]);
    expect(new Set([...labels.values()].map((label) => label.normalize("NFC"))).size).toBe(3);
  });
});
