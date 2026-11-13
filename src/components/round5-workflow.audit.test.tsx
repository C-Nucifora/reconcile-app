import { act, createElement } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { AppState } from "../types";
import { computeBalances, computeExpenseShares } from "../engine/balances";
import { buildReport } from "../export/report";
import { loadStoredState, STORAGE_KEY, validateState } from "../state/storage";

// Exercise the real App workspace, provider, editors, list and financial panels.
// The synthetic host does not establish native validity, focus or event bubbling.
// Receipts and theme controls are outside these ledger workflows.
vi.mock("./ReceiptUpload", () => ({ default: () => null }));
vi.mock("./ThemeToggle", () => ({ default: () => null }));
vi.mock("../lib/imageStore", () => ({
  retainImageReferences: vi.fn(), commitImageReferences: vi.fn(),
  deleteUnusedImage: vi.fn().mockResolvedValue(undefined), getImageURL: vi.fn(),
}));

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
function nodes(host: Host, predicate: (node: Host) => boolean): Host[] {
  return [...(predicate(host) ? [host] : []), ...host.children.flatMap((child) => nodes(child, predicate))];
}
function one(host: Host, predicate: (node: Host) => boolean) {
  const found = nodes(host, predicate);
  expect(found).toHaveLength(1);
  return found[0];
}
function text(node: Host): string {
  return node.type === "#text" ? String(node.props.value) : node.children.map(text).join("");
}
function control(host: Host, label: string) { return one(host, (node) => node.props["aria-label"] === label); }
function button(host: Host, label: string) { return one(host, (node) => node.type === "button" && text(node) === label); }
function field(host: Host, suffix: string) {
  return one(host, (node) => ["input", "select"].includes(node.type) && String(node.props.id).endsWith(suffix));
}
function form(host: Host, editing = false) { return control(host, editing ? "Edit expense" : "Add an expense"); }
function invoke(node: Host, name: string, payload?: unknown): unknown {
  expect(node.props[name]).toBeTypeOf("function");
  return (node.props[name] as (event?: unknown) => unknown)(payload);
}
async function event(fn: () => unknown) { await act(async () => { await fn(); }); }
async function click(node: Host) { await event(() => invoke(node, "onClick")); }
async function change(host: Host, node: Host, value: string) {
  await event(() => invoke(node, "onChange", { target: { value } }));
  // Reproduce only the enclosing form's change bubbling, as React DOM does.
  await event(() => nodes(host, (candidate) => candidate.type === "form" && !!candidate.props.onChange &&
    nodes(candidate, (child) => child === node).length > 0).forEach((parent) => invoke(parent, "onChange")));
}
async function submit(host: Host, editing = false) {
  expect(button(form(host, editing), editing ? "Save changes" : "Add expense").props.disabled).toBe(false);
  await event(() => invoke(form(host, editing), "onSubmit", { preventDefault: vi.fn() }));
}
async function fill(host: Host, description: string, amount: string) {
  await change(host, field(form(host), "-description"), description);
  await change(host, field(form(host), "-amount"), amount);
  await change(host, field(form(host), "-date"), "2026-01-02");
}

const mounts: { unmount: () => Promise<void> }[] = [];
async function mount() {
  const host: Host = { type: "ROOT", props: {}, children: [], focus: vi.fn() };
  const root = renderer.createContainer(host);
  async function unmount() { await act(async () => { renderer.updateContainer(null, root, null, () => {}); }); }
  // Keep changing provider siblings below an ordinary host. This installed
  // reconciler does not implement insertInContainerBefore.
  await act(async () => { renderer.updateContainer(createElement("audit-root", null, <App />), root, null, () => {}); });
  const ui = { host, unmount };
  mounts.push(ui);
  return ui;
}
function fixture(): AppState {
  return { schemaVersion: 1, activeGroupId: "fictional-garden", groups: [{
    id: "fictional-garden", name: "Fictional garden", expenses: [], people: [
      { id: "constructor", name: "Aster" },
      { id: "fictional-second-aster", name: "Aster" },
      { id: "fictional-reserved-label", name: "Aster (1)" },
    ],
  }, {
    id: "fictional-observatory", name: "Fictional observatory", expenses: [], people: [
      { id: "fictional-birch", name: "Birch" }, { id: "fictional-cedar", name: "Cedar" },
    ],
  }] };
}
const labels = ["Aster (2)", "Aster (3)", "Aster (1)"];
let bytes: string;
const setItem = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: vi.fn(() => true) });
  let nextId = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `fictional-workflow-${nextId++}` });
  bytes = JSON.stringify(fixture());
  setItem.mockReset().mockImplementation((_key: string, value: string) => { bytes = value; });
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === STORAGE_KEY ? bytes : null, setItem });
  vi.stubGlobal("navigator", { locks: { request: async (_key: string, callback: () => unknown) => callback() } });
});
afterEach(async () => {
  for (const ui of mounts.splice(0)) await ui.unmount();
  vi.unstubAllGlobals();
});
function heldWrites() {
  const queue: Array<() => void> = [];
  vi.stubGlobal("navigator", { locks: { request: (_key: string, callback: () => string) => new Promise<string>((resolve, reject) => {
    queue.push(() => { try { resolve(callback()); } catch (error) { reject(error); } });
  }) } });
  return {
    release: async () => {
      expect(queue).toHaveLength(1);
      await event(() => queue.shift()!());
    },
    size: () => queue.length,
  };
}
function loaded() {
  const result = loadStoredState();
  expect(result.error).toBeNull();
  expect(validateState(result.state)).toEqual(result.state);
  return result.state;
}
function report(state: AppState) {
  return buildReport(state.groups[0], {
    sections: { expenses: true, settleUp: true, perPerson: true }, generatedDate: "2026-01-03",
  });
}

describe("round5 complete ledger workflows", () => {
  it("saves all five modes through a failed final write and retry without confusing duplicate identities", async () => {
    expect(validateState(fixture())).toEqual(fixture());
    const original = bytes;
    const locks = heldWrites();
    const { host, unmount } = await mount();
    const ids = fixture().groups[0].people.map((person) => person.id);
    const payer = field(form(host), "-payer");
    expect(payer.children.map((option) => [option.props.value, text(option)])).toEqual(ids.map((id, i) => [id, labels[i]]));

    await fill(host, "Fictional equal fare", "1.01");
    await submit(host);
    await fill(host, "Fictional exact supplies", "1.01");
    await click(button(form(host), "Exact"));
    for (const [index, value] of ["0.10", "0.20", "0.71"].entries()) {
      await change(host, control(form(host), `Exact amount for ${labels[index]}`), value);
    }
    await submit(host);
    await fill(host, "Fictional percentage entry", "1.01");
    await click(button(form(host), "Percent"));
    for (const [index, value] of ["25", "25", "50"].entries()) {
      await change(host, control(form(host), `Percentage for ${labels[index]}`), value);
    }
    await change(host, field(form(host), "-payer"), ids[1]);
    await submit(host);
    await fill(host, "Fictional weighted ride", "1.01");
    await click(button(form(host), "Shares"));
    await change(host, control(form(host), "Shares for Aster (3)"), "2");
    await submit(host);
    await change(host, field(form(host), "-description"), "Fictional item basket");
    await change(host, field(form(host), "-payer"), ids[2]);
    await click(control(form(host), "Itemize expense"));
    await change(host, control(form(host), "Item 1 name"), "Fictional seeds");
    await change(host, control(form(host), "Item 1 price"), "0.07");
    await click(control(form(host), "Assign Aster (2) to item 1"));
    await click(control(form(host), "Assign Aster (3) to item 1"));
    await click(button(form(host), "Add item"));
    await change(host, control(form(host), "Item 2 name"), "Fictional pending pot");
    await change(host, control(form(host), "Item 2 price"), "0.05");
    await submit(host);
    expect(nodes(host, (node) => node.type === "button" && String(node.props["aria-label"]).startsWith("Edit Fictional"))).toHaveLength(5);
    expect(bytes).toBe(original);

    for (let i = 0; i < 4; i++) await locks.release();
    const lastDurable = bytes;
    setItem.mockImplementationOnce(() => { throw new Error("Fictional full disk"); });
    await locks.release();
    expect(bytes).toBe(lastDurable);
    expect(loaded().groups[0].expenses).toHaveLength(4);
    expect(text(one(host, (node) => node.props.role === "alert"))).toContain("Fictional full disk");
    await click(button(host, "Retry saving"));
    await fill(host, "Fictional next unsaved draft", "9.99");
    await locks.release();
    expect(locks.size()).toBe(0);
    expect(field(form(host), "-description").props.value).toBe("Fictional next unsaved draft");
    expect(nodes(host, (node) => node.props.role === "alert")).toHaveLength(0);

    const saved = loaded();
    const expenses = saved.groups[0].expenses;
    expect(expenses.map((expense) => expense.splitType)).toEqual(["equal", "exact", "percent", "shares", "equal"]);
    expect(expenses.map((expense) => expense.amountCents)).toEqual([101, 101, 101, 101, 12]);
    expect(expenses.map((expense) => expense.payerId)).toEqual([ids[0], ids[0], ids[1], ids[0], ids[2]]);
    expect(expenses.map((expense) => [...computeExpenseShares(expense).values()])).toEqual([
      [34, 34, 33], [10, 20, 71], [25, 25, 51], [25, 51, 25], [4, 3],
    ]);
    expect([...computeBalances(saved.groups[0])]).toEqual([[ids[0], 205], [ids[1], -32], [ids[2], -173]]);
    const data = report(saved);
    expect(data.expenses?.map((expense) => expense.payerName)).toEqual([labels[0], labels[0], labels[1], labels[0], labels[2]]);
    expect(data.expenses?.map((expense) => expense.pendingCents)).toEqual([0, 0, 0, 0, 5]);
    expect(data.perPerson?.map((person) => [person.name, person.paidCents, person.owedCents])).toEqual([
      [labels[0], 303, 98], [labels[1], 101, 133], [labels[2], 7, 180],
    ]);
    expect(data.settleUp?.transfers).toEqual([
      { from: labels[2], to: labels[0], cents: 173 }, { from: labels[1], to: labels[0], cents: 32 },
    ]);
    await unmount();
    const reloaded = await mount();
    expect(loaded()).toEqual(saved);
    expect(field(form(reloaded.host), "-description").props.value).toBe("");
    expect(text(reloaded.host)).toContain("Aster (2)is owed 2.05");
    expect(text(reloaded.host)).toContain("Aster (1)owes 1.73");
  });

  it("reassigns an edited item to a new same-name person after removing its last original assignee", async () => {
    const state = fixture();
    const group = state.groups[0];
    const removedId = group.people[1].id;
    group.expenses = [{
      id: "fictional-seed-order", description: "Fictional seed order", amountCents: 7,
      payerId: group.people[2].id, date: "2026-01-02", splitType: "equal", members: [],
      items: [{ id: "fictional-seed-item", name: "Fictional seeds", amountCents: 7, assigneeIds: [removedId] }],
    }];
    bytes = JSON.stringify(state);
    const { host } = await mount();
    await click(control(host, "Edit Fictional seed order"));
    await change(host, control(form(host, true), "Item 1 price"), "0.09");
    await click(control(host, "Remove Aster (3)"));
    expect(loaded().groups[0].expenses[0].items![0].assigneeIds).toEqual([]);
    expect(report(loaded()).expenses?.[0].pendingCents).toBe(7);
    await change(host, control(host, "Person name"), "Aster");
    const peopleForm = one(host, (node) => node.type === "form" && nodes(node, (child) => child.props["aria-label"] === "Person name").length === 1);
    await event(() => invoke(peopleForm, "onSubmit", { preventDefault: vi.fn() }));
    const replacementId = loaded().groups[0].people[2].id;
    expect(replacementId).not.toBe(removedId);
    expect(control(form(host, true), "Item 1 price").props.value).toBe("0.09");
    const replacement = control(form(host, true), "Assign Aster (3) to item 1");
    expect(replacement.props["aria-pressed"]).toBe(false);
    await click(replacement);
    await submit(host, true);
    expect(nodes(host, (node) => node.props["aria-label"] === "Edit expense")).toHaveLength(0);
    const saved = loaded();
    expect(saved.groups[0].expenses[0]).toMatchObject({
      id: "fictional-seed-order", amountCents: 9,
      items: [{ id: "fictional-seed-item", amountCents: 9, assigneeIds: [replacementId] }],
    });
    expect([...computeBalances(saved.groups[0])]).toEqual([
      ["constructor", 0], ["fictional-reserved-label", 9], [replacementId, -9],
    ]);
    expect(report(saved).expenses?.[0]).toMatchObject({
      payerName: "Aster (1)", pendingCents: 0, items: [{ assigneeNames: ["Aster (3)"] }],
    });
    expect(report(saved).settleUp?.transfers).toEqual([{ from: "Aster (3)", to: "Aster (1)", cents: 9 }]);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("item assignments may become pending"));
  });

  it("keeps a second group's ledger when queued saves precede editing and deleting the first group", async () => {
    const locks = heldWrites();
    const { host, unmount } = await mount();
    await fill(host, "Fictional garden ticket", "0.05");
    await submit(host);
    await change(host, field(form(host), "-description"), "Fictional discarded garden draft");
    await click(control(form(host), "Itemize expense"));
    await click(button(host, "Fictional observatory"));
    expect(field(form(host), "-description").props.value).toBe("");
    expect(control(form(host), "Itemize expense").props["aria-checked"]).toBe(false);
    await fill(host, "Fictional observatory ticket", "0.07");
    await click(button(form(host), "Exact"));
    await submit(host);
    await click(button(host, "Fictional garden"));
    await click(control(host, "Edit Fictional garden ticket"));
    await click(button(form(host, true), "Shares"));
    await change(host, control(form(host, true), "Shares for Aster (3)"), "2");
    await submit(host, true);
    // Scope the group Delete action, excluding the expense row's Delete button.
    const switcher = one(host, (node) => node.type === "div" && node.children.some((child) =>
      child.type === "button" && text(child) === "+ New group"));
    await click(button(switcher, "Delete"));
    expect(button(host, "Fictional observatory").props["aria-current"]).toBe("true");
    await fill(host, "Fictional surviving draft", "0.11");
    for (let i = 0; i < 6; i++) await locks.release();
    expect(locks.size()).toBe(0);
    expect(setItem).toHaveBeenCalledTimes(6);
    expect(field(form(host), "-description").props.value).toBe("Fictional surviving draft");
    const saved = loaded();
    expect(saved.activeGroupId).toBe("fictional-observatory");
    expect(saved.groups).toHaveLength(1);
    expect(saved.groups[0].expenses).toHaveLength(1);
    expect(saved.groups[0].expenses[0]).toMatchObject({
      description: "Fictional observatory ticket", amountCents: 7, splitType: "exact",
      members: [{ personId: "fictional-birch", value: 4 }, { personId: "fictional-cedar", value: 3 }],
    });
    expect([...computeBalances(saved.groups[0])]).toEqual([["fictional-birch", 3], ["fictional-cedar", -3]]);
    expect(report(saved).settleUp?.transfers).toEqual([{ from: "Cedar", to: "Birch", cents: 3 }]);
    await unmount();
    const reloaded = await mount();
    expect(loaded()).toEqual(saved);
    expect(nodes(reloaded.host, (node) => node.type === "button" && text(node) === "Fictional garden")).toHaveLength(0);
    expect(text(reloaded.host)).toContain("Fictional observatory ticket");
  });
});
