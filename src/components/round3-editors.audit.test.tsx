import { act, Children, cloneElement, createElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group, Person } from "../types";
import ExpenseForm from "./ExpenseForm";
import ItemsEditor from "./ItemsEditor";
import PeopleManager from "./PeopleManager";
import SplitEditor, { type SplitEditorValue } from "./SplitEditor";
import type { ItemDraft } from "./expenseValidation";
import { validateState } from "../state/storage";

const context = vi.hoisted(() => ({ activeGroup: null as Group | null, dispatch: vi.fn() }));
vi.mock("../state/AppContext", () => ({ useApp: () => context }));
vi.mock("./ReceiptUpload", () => ({ default: () => null }));

// Actual React state/effects and component callbacks. Synthetic host nodes do
// not establish browser validity, keyboard navigation or native focus behavior.
interface Host {
  type: string;
  props: Record<string, unknown>;
  children: Host[];
  focus: () => void;
}
function detach(parent: Host, child: Host) {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
}
function append(parent: Host, child: Host) {
  detach(parent, child);
  parent.children.push(child);
}
const renderer = Reconciler({
  createInstance: (type: string, props: Host["props"]): Host => ({ type, props, children: [], focus: vi.fn() }),
  createTextInstance: (value: string): Host => ({ type: "#text", props: { value }, children: [], focus: vi.fn() }),
  appendChild: append,
  appendChildToContainer: append,
  insertBefore: (parent: Host, child: Host, before: Host) => {
    detach(parent, child);
    parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  removeChild: detach,
  removeChildFromContainer: detach,
  commitTextUpdate: (node: Host, _old: string, value: string) => { node.props.value = value; },
  commitUpdate: (node: Host, _payload: unknown, _type: string, _old: unknown, props: Host["props"]) => { node.props = props; },
  resetAfterCommit: () => {},
});
function descendants(host: Host, predicate: (node: Host) => boolean): Host[] {
  return [...(predicate(host) ? [host] : []), ...host.children.flatMap((child) => descendants(child, predicate))];
}
function text(node: Host): string {
  return node.type === "#text" ? String(node.props.value) : node.children.map(text).join("");
}
const mounts: { unmount: () => Promise<void> }[] = [];
function freshElement(node: ReactNode): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  const children = node.props.children;
  return children === undefined ? cloneElement(node)
    : cloneElement(node, {}, ...Children.toArray(children).map(freshElement));
}
function mount(element: ReactNode) {
  const host: Host = { type: "ROOT", props: {}, children: [], focus: vi.fn() };
  const root = renderer.createContainer(host);
  let current = element;
  async function update(next = current) {
    current = next;
    // Recreate the parent element so mocked context changes render without remounting state.
    await act(async () => { renderer.updateContainer(createElement("audit-root", null,
      freshElement(current)), root, null, () => {}); });
  }
  const nodes = (predicate: (node: Host) => boolean) => descendants(host, predicate);
  function one(predicate: (node: Host) => boolean) {
    const found = nodes(predicate);
    expect(found).toHaveLength(1);
    return found[0];
  }
  const ui = { update, nodes, one, unmount: () => update(null) };
  mounts.push(ui);
  return ui;
}
type Mounted = ReturnType<typeof mount>;
function invoke(node: Host, name: string, event?: unknown): unknown {
  expect(node.props[name]).toBeTypeOf("function");
  return (node.props[name] as (event?: unknown) => unknown)(event);
}
async function event(fn: () => unknown) { await act(async () => { await fn(); }); }
function control(ui: Mounted, label: string) { return ui.one((node) => node.props["aria-label"] === label); }
function button(ui: Mounted, label: string) { return ui.one((node) => node.type === "button" && text(node) === label); }
function field(ui: Mounted, suffix: string) { return ui.one((node) => node.type === "input" && String(node.props.id).endsWith(suffix)); }
async function click(node: Host) { await event(() => invoke(node, "onClick")); }
async function change(ui: Mounted, node: Host, value: string) {
  await event(() => invoke(node, "onChange", { target: { value } }));
  // Host callbacks do not bubble; reproduce React DOM's form change separately.
  await event(() => ui.nodes((candidate) => candidate.type === "form" && !!candidate.props.onChange)
    .forEach((form) => invoke(form, "onChange")));
}
function participant(ui: Mounted, label: string) {
  const list = control(ui, "Split participants");
  const row = list.children.find((node) => descendants(node, (child) => child.type === "label" && text(child) === label).length > 0);
  expect(row).toBeDefined();
  return row!;
}
async function toggleParticipant(ui: Mounted, label: string) {
  const checkboxes = descendants(participant(ui, label), (node) => node.type === "input" && node.props.type === "checkbox");
  expect(checkboxes).toHaveLength(1);
  await event(() => invoke(checkboxes[0], "onChange"));
}
function preview(ui: Mounted, label: string) {
  const row = participant(ui, label);
  return text(row.children[row.children.length - 1]);
}
function status(ui: Mounted) { return text(ui.one((node) => node.props.role === "status")); }
async function submit(ui: Mounted) {
  await event(() => invoke(control(ui, "Add an expense"), "onSubmit", { preventDefault: vi.fn() }));
}
const people: Person[] = [{ id: "fictional-aster", name: "Aster" }, { id: "fictional-birch", name: "Birch" }];
const equal: SplitEditorValue = { splitType: "equal", members: people.map(({ id }) => ({ personId: id, value: 0 })) };
let observedSplit: SplitEditorValue;
function ControlledSplit({ amount = 1001, participants = people }: { amount?: number; participants?: Person[] }) {
  const [value, setValue] = useState(equal);
  useEffect(() => { observedSplit = value; }, [value]);
  return <SplitEditor amountCents={amount} people={participants} value={value} onChange={setValue} />;
}
let observedItems: ItemDraft[];
function ControlledItems() {
  const [items, setItems] = useState<ItemDraft[]>([
    { id: "fictional-snack", name: "Fictional snack", priceInput: "0.05", assigneeIds: [] },
  ]);
  useEffect(() => { observedItems = items; }, [items]);
  return <ItemsEditor people={people} items={items} onChange={setItems} />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
  context.activeGroup = { id: "fictional-editors", name: "Fictional editors", people, expenses: [] };
  context.dispatch.mockReset().mockReturnValue(true);
});
afterEach(async () => {
  for (const ui of mounts.splice(0)) await ui.unmount();
  vi.unstubAllGlobals();
});
async function form() {
  const ui = mount(<ExpenseForm />);
  await ui.update();
  await change(ui, field(ui, "-description"), "Fictional market");
  await change(ui, field(ui, "-amount"), "10.01");
  return ui;
}

describe("round3 editors audit with real React state and effects", () => {
  it.each(["100.0000000000000001", "99.99999999999999999"])("rejects rounded percentage literal %s without losing the form draft", async (raw) => {
    const ui = await form();
    await click(button(ui, "Percent"));
    await toggleParticipant(ui, "Birch");
    await change(ui, control(ui, "Percentage for Aster"), raw);
    expect(control(ui, "Percentage for Aster").props.value).toBe(raw);
    expect(control(ui, "Percentage for Aster").props["aria-invalid"]).toBe(true);
    expect(button(ui, "Add expense").props.disabled).toBe(true);
    await submit(ui);
    expect(context.dispatch).not.toHaveBeenCalled();
    expect(field(ui, "-description").props.value).toBe("Fictional market");
    await change(ui, control(ui, "Percentage for Aster"), "100.000");
    expect(button(ui, "Add expense").props.disabled).toBe(false);
    await submit(ui);
    expect(context.dispatch).toHaveBeenCalledOnce();
    expect(context.dispatch.mock.calls[0][0]).toMatchObject({ type: "ADD_EXPENSE", expense: {
      amountCents: 1001, splitType: "percent", members: [{ personId: people[0].id, value: 100 }],
    } });
    expect(field(ui, "-description").props.value).toBe("");
  });

  it.each(["__proto__", "constructor", "toString"].flatMap((personId) => [
    { personId, mode: "Exact", label: "Exact amount", expected: "5.01" },
    { personId, mode: "Percent", label: "Percentage", expected: "50" },
    { personId, mode: "Shares", label: "Shares", expected: "1" },
  ]))("uses numeric $mode text for accepted person ID $personId", async ({ personId, mode, label, expected }) => {
    context.activeGroup = { ...context.activeGroup!, people: [
      { id: personId, name: "Fictional reserved" }, { id: "fictional-other", name: "Fictional other" },
    ] };
    expect(validateState({ schemaVersion: 1, activeGroupId: context.activeGroup.id, groups: [context.activeGroup] }).groups[0])
      .toEqual(context.activeGroup);
    const ui = await form();
    await click(button(ui, mode));
    expect(control(ui, `${label} for Fictional reserved`).props.value).toBe(expected);
    await change(ui, control(ui, `${label} for Fictional reserved`), expected);
    await submit(ui);
    expect(context.dispatch).toHaveBeenCalledOnce();
    expect(context.dispatch.mock.calls[0][0].expense.members[0].personId).toBe(personId);
    expect(context.dispatch.mock.calls[0][0].expense.members[0].value).toBe(mode === "Exact" ? 501 : Number(expected));
  });

  it("keeps exact typing visible, blocks invalid drafts and requires correction after amount changes", async () => {
    const ui = mount(<ControlledSplit />);
    await ui.update();
    await click(button(ui, "Exact"));
    expect(observedSplit.members).toEqual([{ personId: people[0].id, value: 501 }, { personId: people[1].id, value: 500 }]);
    for (const raw of ["", ".", "4.001"]) {
      await change(ui, control(ui, "Exact amount for Aster"), raw);
      expect(control(ui, "Exact amount for Aster").props.value).toBe(raw);
      expect(control(ui, "Exact amount for Aster").props["aria-invalid"]).toBe(true);
      expect(Number.isNaN(observedSplit.members[0].value)).toBe(true);
      expect(status(ui)).toBe("Enter valid non-negative split values.");
      expect(preview(ui, "Birch")).toBe("0.00");
    }
    for (const raw of ["4.", "4.0", "4.00"]) {
      await change(ui, control(ui, "Exact amount for Aster"), raw);
      expect(control(ui, "Exact amount for Aster").props.value).toBe(raw);
      expect(observedSplit.members[0].value).toBe(400);
    }
    await change(ui, control(ui, "Exact amount for Birch"), "6.01");
    expect(status(ui)).toBe("Exact amounts match the total.");
    expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["4.00", "6.01"]);
    await ui.update(<ControlledSplit amount={1201} />);
    expect(control(ui, "Exact amount for Aster").props.value).toBe("4.00");
    expect(control(ui, "Exact amount for Birch").props.value).toBe("6.01");
    expect(status(ui)).toBe("2.00 left to assign.");
    await change(ui, control(ui, "Exact amount for Birch"), "8.01");
    expect(status(ui)).toBe("Exact amounts match the total.");
    expect(observedSplit.members).toEqual([{ personId: people[0].id, value: 400 }, { personId: people[1].id, value: 801 }]);
  });

  it("keeps decimal percentages attached to IDs through reorder and membership changes", async () => {
    const ui = mount(<ControlledSplit />);
    await ui.update();
    await click(button(ui, "Percent"));
    await change(ui, control(ui, "Percentage for Aster"), "33.30");
    await change(ui, control(ui, "Percentage for Birch"), "66.70");
    expect(status(ui)).toBe("Percentages add up to 100%.");
    expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["3.33", "6.68"]);
    await ui.update(<ControlledSplit participants={[people[1], people[0]]} amount={101} />);
    expect(control(ui, "Percentage for Aster").props.value).toBe("33.30");
    expect(control(ui, "Percentage for Birch").props.value).toBe("66.70");
    expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["0.34", "0.67"]);
    await toggleParticipant(ui, "Aster");
    expect(status(ui)).toContain("must be 100%");
    await toggleParticipant(ui, "Aster");
    expect(control(ui, "Percentage for Aster").props.value).toBe("0");
    expect(control(ui, "Percentage for Birch").props.value).toBe("66.70");
    await change(ui, control(ui, "Percentage for Aster"), "33.3");
    expect(observedSplit.members).toEqual([{ personId: people[1].id, value: 66.7 }, { personId: people[0].id, value: 33.3 }]);
    expect(status(ui)).toBe("Percentages add up to 100%.");
    expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["0.34", "0.67"]);
  });

  it("rejects fractional or exponent shares, recovers and resets units when the split mode changes", async () => {
    const ui = mount(<ControlledSplit />);
    await ui.update();
    await click(button(ui, "Shares"));
    for (const raw of ["", "0", "1.5", "2.0000000000000001", "9007199254740990.1", "2e1", "9007199254740992"]) {
      await change(ui, control(ui, "Shares for Aster"), raw);
      expect(control(ui, "Shares for Aster").props.value).toBe(raw);
      expect(control(ui, "Shares for Aster").props["aria-invalid"]).toBe(true);
      expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["0.00", "0.00"]);
    }
    await change(ui, control(ui, "Shares for Aster"), "2.");
    expect(status(ui)).toBe("Split by shares.");
    expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["6.67", "3.34"]);
    await click(button(ui, "Percent"));
    expect(control(ui, "Percentage for Aster").props.value).toBe("50");
    expect(control(ui, "Percentage for Birch").props.value).toBe("50");
    await click(button(ui, "Exact"));
    expect(control(ui, "Exact amount for Aster").props.value).toBe("5.01");
    expect(control(ui, "Exact amount for Birch").props.value).toBe("5.00");
    await click(button(ui, "Equal"));
    expect(observedSplit).toEqual(equal);
    expect([preview(ui, "Aster"), preview(ui, "Birch")]).toEqual(["5.01", "5.00"]);
  });

  it.each([
    { mode: "Exact", label: "Exact amount", raw: "4.001", corrected: "5.01" },
    { mode: "Percent", label: "Percentage", raw: "25e", corrected: "50" },
    { mode: "Shares", label: "Shares", raw: "2e", corrected: "2" },
  ])("retains the invalid $mode text when temporarily itemizing and permits correction", async ({ mode, label, raw, corrected }) => {
    const ui = await form();
    await click(button(ui, mode));
    await change(ui, control(ui, `${label} for Aster`), raw);
    expect(button(ui, "Add expense").props.disabled).toBe(true);
    await submit(ui);
    expect(context.dispatch).not.toHaveBeenCalled();
    await click(control(ui, "Itemize expense"));
    await change(ui, control(ui, "Item 1 name"), "Fictional pears");
    await change(ui, control(ui, "Item 1 price"), "2.75");
    expect(button(ui, "Add expense").props.disabled).toBe(false);
    await click(control(ui, "Itemize expense"));
    // The UI promises that switching keeps entries. An invalid draft needs
    // correction, but its text must remain available for that correction.
    expect(control(ui, `${label} for Aster`).props.value).toBe(raw);
    expect(control(ui, `${label} for Aster`).props["aria-invalid"]).toBe(true);
    expect(button(ui, "Add expense").props.disabled).toBe(true);
    await change(ui, control(ui, `${label} for Aster`), corrected);
    expect(button(ui, "Add expense").props.disabled).toBe(false);
    await submit(ui);
    expect(context.dispatch).toHaveBeenCalledOnce();
    expect(context.dispatch.mock.calls[0][0]).toMatchObject({ type: "ADD_EXPENSE", expense: { amountCents: 1001, splitType: mode.toLowerCase() } });
    expect(context.dispatch.mock.calls[0][0].expense.items).toBeUndefined();
    expect(field(ui, "-description").props.value).toBe("");
    expect(field(ui, "-amount").props.value).toBe("");
    expect(control(ui, "Itemize expense").props["aria-checked"]).toBe(false);
    expect(status(ui)).toBe("Split evenly.");
    await change(ui, field(ui, "-amount"), "7.00");
    await click(button(ui, "Exact"));
    expect(control(ui, "Exact amount for Aster").props.value).toBe("3.50");
    expect(control(ui, "Exact amount for Birch").props.value).toBe("3.50");
  });

  it("preserves both mode drafts and saves only the active pending itemized amount", async () => {
    const ui = await form();
    await click(button(ui, "Exact"));
    await change(ui, control(ui, "Exact amount for Aster"), "4.00");
    await change(ui, control(ui, "Exact amount for Birch"), "6.01");
    await click(control(ui, "Itemize expense"));
    await change(ui, control(ui, "Item 1 name"), "Fictional pears");
    await change(ui, control(ui, "Item 1 price"), "2.750");
    expect(button(ui, "Add expense").props.disabled).toBe(true);
    await change(ui, control(ui, "Item 1 price"), "2.75");
    await click(control(ui, "Itemize expense"));
    expect(field(ui, "-amount").props.value).toBe("10.01");
    expect(control(ui, "Exact amount for Aster").props.value).toBe("4.00");
    expect(control(ui, "Exact amount for Birch").props.value).toBe("6.01");
    await click(control(ui, "Itemize expense"));
    expect(control(ui, "Item 1 name").props.value).toBe("Fictional pears");
    expect(control(ui, "Item 1 price").props.value).toBe("2.75");
    await submit(ui);
    expect(context.dispatch).toHaveBeenCalledOnce();
    expect(context.dispatch.mock.calls[0][0]).toMatchObject({
      type: "ADD_EXPENSE", groupId: "fictional-editors",
      expense: { amountCents: 275, splitType: "equal", members: [], items: [{ name: "Fictional pears", amountCents: 275, assigneeIds: [] }] },
    });
  });

  it("moves an item through pending assignment, invalid price, row deletion and blank-row recovery", async () => {
    const ui = mount(<ControlledItems />);
    await ui.update();
    expect(ui.nodes((node) => node.type === "p" && text(node).startsWith("Pending."))).toHaveLength(1);
    await click(control(ui, "Assign Birch to item 1"));
    expect(observedItems[0].assigneeIds).toEqual([people[1].id]);
    expect(text(control(ui, "Assign Birch to item 1"))).toBe("Birch0.05");
    await click(control(ui, "Assign Aster to item 1"));
    expect(text(control(ui, "Assign Birch to item 1"))).toBe("Birch0.03");
    expect(text(control(ui, "Assign Aster to item 1"))).toBe("Aster0.02");
    await change(ui, control(ui, "Item 1 price"), "0.001");
    expect(control(ui, "Item 1 price").props.value).toBe("0.001");
    expect(control(ui, "Item 1 price").props["aria-invalid"]).toBe(true);
    expect(observedItems[0].assigneeIds).toEqual([people[1].id, people[0].id]);
    await change(ui, control(ui, "Item 1 price"), "0.07");
    expect(text(control(ui, "Assign Birch to item 1"))).toBe("Birch0.04");
    expect(text(control(ui, "Assign Aster to item 1"))).toBe("Aster0.03");
    await click(control(ui, "Assign Birch to item 1"));
    await click(control(ui, "Assign Aster to item 1"));
    expect(observedItems[0].assigneeIds).toEqual([]);
    await click(button(ui, "Add item"));
    const added = observedItems[1].id;
    expect(control(ui, "Item 2 name").focus).toHaveBeenCalled();
    await change(ui, control(ui, "Item 2 name"), "Fictional water");
    await change(ui, control(ui, "Item 2 price"), "1.00");
    await click(control(ui, "Assign Aster to item 2"));
    await click(control(ui, "Remove item 1"));
    expect(observedItems).toEqual([{ id: added, name: "Fictional water", priceInput: "1.00", assigneeIds: [people[0].id] }]);
    expect(control(ui, "Item 1 name").props.value).toBe("Fictional water");
    expect(control(ui, "Assign Aster to item 1").props["aria-pressed"]).toBe(true);
    await click(control(ui, "Remove item 1"));
    expect(observedItems).toHaveLength(1);
    expect(observedItems[0]).toMatchObject({ name: "", priceInput: "", assigneeIds: [] });
    expect(observedItems[0].id).not.toBe(added);
    expect(control(ui, "Item 1 name").focus).toHaveBeenCalled();
    await change(ui, control(ui, "Item 1 name"), "Fictional recovery");
    await change(ui, control(ui, "Item 1 price"), "0.09");
    await click(control(ui, "Assign Birch to item 1"));
    expect(observedItems[0]).toMatchObject({ name: "Fictional recovery", priceInput: "0.09", assigneeIds: [people[1].id] });
    expect(text(control(ui, "Assign Birch to item 1"))).toBe("Birch0.09");
  });

  it("uses unique canonical-name controls for the correct payer, rename and delete after reorder", async () => {
    const original: Person[] = [
      { id: "fictional-composed", name: "\u00c9lan" },
      { id: "fictional-decomposed", name: "E\u0301lan" },
      { id: "fictional-literal", name: "\u00c9lan (1)" },
    ];
    context.activeGroup = { ...context.activeGroup!, people: original };
    const ui = mount(<><PeopleManager /><ExpenseForm /></>);
    await ui.update();
    const options = () => ui.nodes((node) => node.type === "option").map((node) => [node.props.value, text(node)]);
    expect(options()).toEqual([
      ["fictional-composed", "\u00c9lan (2)"], ["fictional-decomposed", "E\u0301lan (3)"], ["fictional-literal", "\u00c9lan (1)"],
    ]);
    await change(ui, field(ui, "-description"), "Fictional canonical labels");
    await change(ui, field(ui, "-amount"), "0.09");
    await change(ui, ui.one((node) => node.type === "select"), "fictional-decomposed");
    await click(button(ui, "Exact"));
    await change(ui, control(ui, "Exact amount for E\u0301lan (3)"), "0.03");
    context.activeGroup = { ...context.activeGroup!, people: [original[1], original[2], original[0]] };
    await ui.update();
    expect(options()).toEqual([
      ["fictional-decomposed", "E\u0301lan (2)"], ["fictional-literal", "\u00c9lan (1)"], ["fictional-composed", "\u00c9lan (3)"],
    ]);
    expect(control(ui, "Exact amount for E\u0301lan (2)").props.value).toBe("0.03");
    expect(ui.one((node) => node.type === "select").props.value).toBe("fictional-decomposed");
    await click(control(ui, "Rename E\u0301lan (2)"));
    await change(ui, control(ui, "Rename E\u0301lan (2)"), "Fictional Cedar");
    await click(control(ui, "Save name"));
    expect(context.dispatch).toHaveBeenLastCalledWith({ type: "RENAME_PERSON", groupId: "fictional-editors", personId: "fictional-decomposed", name: "Fictional Cedar" });
    context.activeGroup = { ...context.activeGroup!, people: [{ ...original[1], name: "Fictional Cedar" }, original[2], original[0]] };
    await ui.update();
    expect(control(ui, "Exact amount for Fictional Cedar").props.value).toBe("0.03");
    await click(control(ui, "Remove Fictional Cedar"));
    expect(context.dispatch).toHaveBeenLastCalledWith({ type: "REMOVE_PERSON", groupId: "fictional-editors", personId: "fictional-decomposed" });
    context.activeGroup = { ...context.activeGroup!, people: [original[2], original[0]] };
    await ui.update();
    expect(ui.one((node) => node.type === "select").props.value).toBe("fictional-literal");
    expect(control(ui, "Exact amount for \u00c9lan").props.value).toBe("0.03");
    expect(button(ui, "Add expense").props.disabled).toBe(true);
    await change(ui, control(ui, "Exact amount for \u00c9lan"), "0.06");
    await submit(ui);
    const saved = context.dispatch.mock.calls[context.dispatch.mock.calls.length - 1][0];
    expect(saved).toMatchObject({ type: "ADD_EXPENSE", expense: { payerId: "fictional-literal", amountCents: 9, members: [
      { personId: "fictional-composed", value: 6 }, { personId: "fictional-literal", value: 3 },
    ] } });
    expect(original.map(({ name }) => name)).toEqual(["\u00c9lan", "E\u0301lan", "\u00c9lan (1)"]);
  });

  it("does not transfer a deleted participant's exact draft to a new person with the same name", async () => {
    const ui = await form();
    await click(button(ui, "Exact"));
    await change(ui, control(ui, "Exact amount for Aster"), "4.00");
    await change(ui, control(ui, "Exact amount for Birch"), "6.01");
    context.activeGroup = { ...context.activeGroup!, people: [people[1]] };
    await ui.update();
    expect(status(ui)).toBe("4.00 left to assign.");
    const replacement = { id: "fictional-new-aster", name: "Aster" };
    context.activeGroup = { ...context.activeGroup!, people: [people[1], replacement] };
    await ui.update();
    expect(descendants(participant(ui, "Aster"), (node) => node.type === "input" && node.props.type === "checkbox")[0].props.checked).toBe(false);
    await toggleParticipant(ui, "Aster");
    expect(control(ui, "Exact amount for Aster").props.value).toBe("0.00");
    await change(ui, control(ui, "Exact amount for Aster"), "4.00");
    await submit(ui);
    expect(context.dispatch).toHaveBeenCalledOnce();
    expect(context.dispatch.mock.calls[0][0]).toMatchObject({ type: "ADD_EXPENSE", expense: {
      payerId: people[1].id, amountCents: 1001, members: [
        { personId: people[1].id, value: 601 }, { personId: replacement.id, value: 400 },
      ],
    } });
  });
});
