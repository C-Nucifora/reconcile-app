import { act, createElement, useEffect, type ReactNode } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/AppContext";
import { STORAGE_KEY, validateState } from "../state/storage";
import type { AppState, Expense } from "../types";
import ExpenseForm from "./ExpenseForm";
import PeopleManager from "./PeopleManager";
import GroupSwitcher from "./GroupSwitcher";
import ReceiptUpload from "./ReceiptUpload";

// Real React hooks/effects, synthetic host nodes. This does not emulate native
// date validity, DOM focus, event bubbling, IndexedDB or image decoding.
interface Host {
  type: string;
  props: Record<string, unknown>;
  children: Host[];
  focus: () => void;
}
function detach(parent: Host, child: Host) {
  const i = parent.children.indexOf(child);
  if (i >= 0) parent.children.splice(i, 1);
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
const images = vi.hoisted(() => ({
  compressImage: vi.fn(), putImage: vi.fn(), deleteUnusedImage: vi.fn(),
  getImageURL: vi.fn(), retainImageReferences: vi.fn(), commitImageReferences: vi.fn(),
}));
vi.mock("../lib/imageStore", () => images);

const mounts: { unmount: () => Promise<void> }[] = [];
function mount(element: ReactNode) {
  const host: Host = { type: "ROOT", props: {}, children: [], focus: vi.fn() };
  const root = renderer.createContainer(host);
  let current = element;
  async function update(next = current) {
    current = next;
    await act(async () => { renderer.updateContainer(createElement("audit-root", null, current), root, null, () => {}); });
  }
  function nodes(predicate: (node: Host) => boolean) {
    const found: Host[] = [];
    function visit(node: Host) { if (predicate(node)) found.push(node); node.children.forEach(visit); }
    visit(host);
    return found;
  }
  function one(predicate: (node: Host) => boolean) {
    const found = nodes(predicate);
    expect(found).toHaveLength(1);
    return found[0];
  }
  const api = { update, nodes, one, unmount: () => update(null) };
  mounts.push(api);
  return api;
}
type Mounted = ReturnType<typeof mount>;
function text(node: Host): string { return node.type === "#text" ? String(node.props.value) : node.children.map(text).join(""); }
function invoke(node: Host, name: string, payload?: unknown): unknown {
  const callback = node.props[name];
  expect(callback).toBeTypeOf("function");
  return (callback as (event?: unknown) => unknown)(payload);
}
function button(ui: Mounted, label: string) { return ui.one((n) => n.type === "button" && text(n) === label); }
async function event(fn: () => unknown) { await act(async () => { await fn(); }); }
async function change(ui: Mounted, node: Host, value: string) {
  await event(() => invoke(node, "onChange", { target: { value } }));
  // React's host renderer does not synthesize bubbling; reproduce the form's
  // onChange separately, as React DOM does for text/select/file changes.
  await event(() => ui.nodes((n) => n.type === "form" && !!n.props.onChange).forEach((n) => invoke(n, "onChange")));
}
function field(ui: Mounted, suffix: string) { return ui.one((n) => n.type === "input" && String(n.props.id).endsWith(suffix)); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const expense: Expense = {
  id: "fictional-dinner", description: "Fictional dinner", amountCents: 1200,
  payerId: "fictional-alex", date: "2026-01-01", splitType: "equal",
  members: [{ personId: "fictional-alex", value: 0 }, { personId: "fictional-sam", value: 0 }],
};
function initial(): AppState {
  return { schemaVersion: 1, activeGroupId: "fictional-trip", groups: [{
    id: "fictional-trip", name: "Fictional trip", people: [
      { id: "fictional-alex", name: "Fictional Alex" }, { id: "fictional-sam", name: "Fictional Sam" },
    ], expenses: [],
  }, { id: "fictional-other", name: "Fictional other", people: [{ id: "fictional-jo", name: "Fictional Jo" }], expenses: [] }] };
}
let observed: ReturnType<typeof useApp>;
function Probe() {
  const app = useApp();
  useEffect(() => { observed = app; }, [app]);
  return null;
}
function Workspace({ edit = false }: { edit?: boolean }) {
  const { activeGroup } = useApp();
  return <><GroupSwitcher /><div key={activeGroup?.id}><PeopleManager /><ExpenseForm editingExpense={edit ? activeGroup?.expenses[0] : undefined} /></div><Probe /></>;
}
let bytes: string;
const setItem = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true, prompt: vi.fn() });
  bytes = JSON.stringify(initial());
  setItem.mockReset().mockImplementation((_key: string, value: string) => { bytes = value; });
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === STORAGE_KEY ? bytes : null, setItem });
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, callback: () => unknown) => callback() } });
  Object.values(images).forEach((mock) => mock.mockReset());
  images.compressImage.mockResolvedValue(new Blob(["fictional JPEG pixels"], { type: "image/jpeg" }));
  images.putImage.mockResolvedValue("fictional-new-receipt");
  images.getImageURL.mockResolvedValue(null);
  images.deleteUnusedImage.mockResolvedValue(undefined);
});
afterEach(async () => {
  for (const ui of mounts.splice(0)) await ui.unmount();
  vi.unstubAllGlobals();
});
async function app(edit = false) {
  if (edit) { const state = initial(); state.groups[0].expenses = [expense]; bytes = JSON.stringify(state); }
  const ui = mount(<AppProvider><Workspace edit={edit} /></AppProvider>);
  await ui.update();
  return ui;
}
async function fill(ui: Mounted) {
  await change(ui, field(ui, "-description"), "Fictional lunch");
  await change(ui, field(ui, "-amount"), "12.00");
}
async function submit(ui: Mounted) {
  await event(() => invoke(ui.one((n) => n.type === "form" && !!n.props["aria-label"]), "onSubmit", { preventDefault: vi.fn() }));
}
async function select(ui: Mounted) {
  let completion: Promise<void> | undefined;
  await event(() => {
    completion = invoke(ui.one((n) => n.type === "input" && n.props.type === "file"), "onChange", { target: { files: [new File(["fictional bytes"], "fictional.png", { type: "image/png" })], value: "fictional.png" } }) as Promise<void>;
  });
  return { finish: async () => { await event(() => completion); } };
}

describe("round1 lifecycle audit using real React effects and provider", () => {
  it.each(["compression", "write"])("does not silently discard a selected receipt when adding during %s", async (stage) => {
    const pending = deferred<Blob | string>();
    if (stage === "compression") images.compressImage.mockReturnValueOnce(pending.promise);
    else images.putImage.mockReturnValueOnce(pending.promise);
    const ui = await app();
    await fill(ui);
    const upload = await select(ui);
    expect(button(ui, "Adding photo…").props.disabled).toBe(true);
    await submit(ui);
    // Saving must wait or remain disabled while the user-selected photo is pending.
    const prematurelySaved = observed.activeGroup!.expenses.map((e) => ({ description: e.description, receiptImageId: e.receiptImageId }));
    await event(() => pending.resolve(stage === "compression" ? new Blob(["fictional pixels"]) : "fictional-discarded-receipt"));
    await upload.finish();
    expect(prematurelySaved, "pending upload was silently discarded by form reset").toEqual([]);
    await submit(ui);
    expect(observed.activeGroup!.expenses[0].receiptImageId).toBe(stage === "compression" ? "fictional-new-receipt" : "fictional-discarded-receipt");
  });

  it("persists a receipt whose upload completed before submission", async () => {
    const ui = await app(); await fill(ui);
    const upload = await select(ui); await upload.finish();
    await submit(ui);
    expect(JSON.parse(bytes).groups[0].expenses[0].receiptImageId).toBe("fictional-new-receipt");
    expect(images.commitImageReferences).toHaveBeenCalledWith(new Set(["fictional-new-receipt"]));
  });

  it("blocks submission in the same event that starts receipt processing", async () => {
    const pending = deferred<Blob>();
    images.compressImage.mockReturnValueOnce(pending.promise);
    const ui = await app(); await fill(ui);
    const input = ui.one((n) => n.type === "input" && n.props.type === "file");
    const form = ui.one((n) => n.type === "form" && !!n.props["aria-label"]);
    let completion: Promise<void> | undefined;
    await event(() => {
      completion = invoke(input, "onChange", { target: {
        files: [new File(["fictional pixels"], "fictional.png", { type: "image/png" })], value: "fictional.png",
      } }) as Promise<void>;
      invoke(form, "onSubmit", { preventDefault: vi.fn() });
    });
    expect(observed.activeGroup!.expenses).toEqual([]);
    await event(() => pending.resolve(new Blob(["fictional JPEG"])));
    await event(() => completion);
    await submit(ui);
    expect(observed.activeGroup!.expenses[0].receiptImageId).toBe("fictional-new-receipt");
  });

  it.each(["compression", "write"])("allows saving the retained draft after receipt %s fails", async (stage) => {
    const pending = deferred<Blob | string>();
    if (stage === "compression") images.compressImage.mockReturnValueOnce(pending.promise);
    else images.putImage.mockReturnValueOnce(pending.promise);
    const ui = await app(); await fill(ui);
    const upload = await select(ui);
    await submit(ui);
    expect(observed.activeGroup!.expenses).toEqual([]);
    await event(() => pending.reject(new Error("fictional decoder fault")));
    await upload.finish();
    expect(field(ui, "-description").props.value).toBe("Fictional lunch");
    expect(text(ui.one((n) => n.props.role === "alert"))).toContain("Couldn't add the photo");
    await submit(ui);
    expect(observed.activeGroup!.expenses).toHaveLength(1);
    expect(observed.activeGroup!.expenses[0].receiptImageId).toBeUndefined();
  });

  it.each(["compression", "write"])("retains the saved expense while its edited receipt is pending at %s", async (stage) => {
    const pending = deferred<Blob | string>();
    if (stage === "compression") images.compressImage.mockReturnValueOnce(pending.promise);
    else images.putImage.mockReturnValueOnce(pending.promise);
    const ui = await app(true); await fill(ui);
    const upload = await select(ui);
    await submit(ui);
    expect(observed.activeGroup!.expenses).toEqual([expense]);
    await event(() => pending.resolve(stage === "compression" ? new Blob(["fictional pixels"]) : "fictional-edited-receipt"));
    await upload.finish();
    await submit(ui);
    expect(observed.activeGroup!.expenses[0].description).toBe("Fictional lunch");
    expect(observed.activeGroup!.expenses[0].receiptImageId).toBe(stage === "compression" ? "fictional-new-receipt" : "fictional-edited-receipt");
    expect(JSON.parse(bytes).groups[0].expenses[0]).toEqual(observed.activeGroup!.expenses[0]);
  });

  it("uses the completed receipt with a captured handler and permits the next draft", async () => {
    const pending = deferred<Blob>();
    images.compressImage.mockReturnValueOnce(pending.promise);
    const ui = await app(); await fill(ui);
    const form = ui.one((n) => n.type === "form" && !!n.props["aria-label"]);
    const capturedSubmit = form.props.onSubmit as (event: { preventDefault: () => void }) => void;
    const upload = await select(ui);
    await event(() => capturedSubmit({ preventDefault: vi.fn() }));
    expect(observed.activeGroup!.expenses).toEqual([]);
    await event(() => pending.resolve(new Blob(["fictional pixels"])));
    await upload.finish();
    await event(() => {
      capturedSubmit({ preventDefault: vi.fn() });
      capturedSubmit({ preventDefault: vi.fn() });
    });
    expect(observed.activeGroup!.expenses).toHaveLength(1);
    expect(observed.activeGroup!.expenses[0].receiptImageId).toBe("fictional-new-receipt");
    await fill(ui); await submit(ui);
    expect(observed.activeGroup!.expenses).toHaveLength(2);
    expect(observed.activeGroup!.expenses[1].receiptImageId).toBeUndefined();
  });

  it.each(["compression", "write"])("keeps a new upload blocked when the previous group's %s completes", async (stage) => {
    const old = deferred<Blob | string>();
    const current = deferred<Blob>();
    if (stage === "compression") images.compressImage.mockReturnValueOnce(old.promise);
    else images.putImage.mockReturnValueOnce(old.promise);
    const ui = await app(); await fill(ui);
    const uploadA = await select(ui);
    await event(() => invoke(button(ui, "Fictional other"), "onClick"));
    await fill(ui);
    images.compressImage.mockReturnValueOnce(current.promise);
    const uploadB = await select(ui);
    await event(() => old.resolve(stage === "compression" ? new Blob(["fictional old pixels"]) : "fictional-old-receipt"));
    await uploadA.finish();
    await submit(ui);
    expect(observed.state.groups.flatMap((g) => g.expenses)).toEqual([]);
    expect(button(ui, "Adding photo…").props.disabled).toBe(true);
    if (stage === "compression") expect(images.putImage).not.toHaveBeenCalled();
    else expect(images.deleteUnusedImage).toHaveBeenCalledWith("fictional-old-receipt");
    await event(() => current.resolve(new Blob(["fictional current pixels"])));
    await uploadB.finish(); await submit(ui);
    expect(observed.state.groups[0].expenses).toEqual([]);
    expect(observed.state.groups[1].expenses[0].receiptImageId).toBe("fictional-new-receipt");
  });

  it.each(["compression", "write"])("cancels a %s-stage upload on group switch without attaching it elsewhere", async (stage) => {
    const pending = deferred<Blob | string>();
    if (stage === "compression") images.compressImage.mockReturnValueOnce(pending.promise);
    else images.putImage.mockReturnValueOnce(pending.promise);
    const ui = await app();
    await fill(ui);
    const upload = await select(ui);
    await event(() => invoke(button(ui, "Fictional other"), "onClick"));
    await event(() => pending.resolve(stage === "compression" ? new Blob(["fictional pixels"]) : "fictional-late-receipt"));
    await upload.finish();
    expect(observed.activeGroup!.id).toBe("fictional-other");
    expect(field(ui, "-description").props.value).toBe("");
    expect(observed.state.groups.flatMap((g) => g.expenses)).toEqual([]);
    if (stage === "compression") expect(images.putImage).not.toHaveBeenCalled();
    else expect(images.deleteUnusedImage).toHaveBeenCalledWith("fictional-late-receipt");
  });

  it.each(["compression", "write"])("cancels a %s-stage upload on explicit edit cancellation", async (stage) => {
    const pending = deferred<Blob | string>();
    if (stage === "compression") images.compressImage.mockReturnValueOnce(pending.promise);
    else images.putImage.mockReturnValueOnce(pending.promise);
    const done = vi.fn();
    function Editor() { const { activeGroup } = useApp(); return <ExpenseForm editingExpense={activeGroup!.expenses[0]} onDone={done} />; }
    const state = initial(); state.groups[0].expenses = [expense]; bytes = JSON.stringify(state);
    const ui = mount(<AppProvider><Editor /><Probe /></AppProvider>);
    await ui.update();
    const upload = await select(ui);
    await event(() => invoke(button(ui, "Cancel"), "onClick"));
    expect(done).toHaveBeenCalledOnce();
    await ui.unmount();
    await event(() => pending.resolve(stage === "compression" ? new Blob(["fictional pixels"]) : "fictional-cancelled-receipt"));
    await upload.finish();
    expect(JSON.parse(bytes).groups[0].expenses[0]).toEqual(expense);
    if (stage === "compression") expect(images.putImage).not.toHaveBeenCalled();
    else expect(images.deleteUnusedImage).toHaveBeenCalledWith("fictional-cancelled-receipt");
  });

  it.each(["decode", "quota"])("retains the existing reference when replacement fails at %s", async (failure) => {
    if (failure === "decode") images.compressImage.mockRejectedValueOnce(new Error("fictional decoder fault"));
    else images.putImage.mockRejectedValueOnce(new Error("fictional quota fault"));
    const onChange = vi.fn();
    const ui = mount(<ReceiptUpload imageId="fictional-original" onChange={onChange} />);
    await ui.update();
    const upload = await select(ui); await upload.finish();
    expect(onChange).not.toHaveBeenCalled();
    expect(text(ui.one((n) => n.props.role === "alert"))).toContain("Couldn't add the photo");
    expect(images.deleteUnusedImage).not.toHaveBeenCalled();
  });

  it("prevents duplicate and synchronously nested submissions", async () => {
    const ui = await app(); await fill(ui);
    const form = ui.one((n) => n.type === "form" && !!n.props["aria-label"]);
    await event(() => { for (let i = 0; i < 8; i++) invoke(form, "onSubmit", { preventDefault: vi.fn() }); });
    expect(observed.activeGroup!.expenses).toHaveLength(1);
  });

  it("prevents reentrant edit submission from its completion callback", async () => {
    const state = initial(); state.groups[0].expenses = [expense]; bytes = JSON.stringify(state);
    const done = vi.fn(() => {
      // Bounded even if the guard regresses.
      if (done.mock.calls.length < 8) invoke(form, "onSubmit", { preventDefault: vi.fn() });
    });
    const ui = mount(<AppProvider><ExpenseForm editingExpense={expense} onDone={done} /><Probe /></AppProvider>);
    await ui.update();
    const form = ui.one((n) => n.type === "form");
    await submit(ui);
    expect(done).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledOnce();
  });

  it("keeps a rejected missing-expense edit and explains the failure", async () => {
    const ui = await app(true);
    await change(ui, field(ui, "-description"), "Fictional draft retained");
    const form = ui.one((n) => n.type === "form" && !!n.props["aria-label"]);
    await event(() => {
      observed.dispatch({ type: "DELETE_EXPENSE", groupId: "fictional-trip", expenseId: expense.id });
      invoke(form, "onSubmit", { preventDefault: vi.fn() });
    });
    expect(field(ui, "-description").props.value).toBe("Fictional draft retained");
    expect(text(ui.one((n) => n.props.role === "alert"))).toContain("draft is still here");
  });

  it("submits the displayed fallback payer and excludes a removed draft participant", async () => {
    const ui = await app(); await fill(ui);
    await event(() => observed.dispatch({ type: "REMOVE_PERSON", groupId: "fictional-trip", personId: "fictional-alex" }));
    await submit(ui);
    expect(observed.activeGroup!.expenses[0].payerId).toBe("fictional-sam");
    expect(observed.activeGroup!.expenses[0].members).toEqual([{ personId: "fictional-sam", value: 0 }]);
    expect(() => validateState(JSON.parse(bytes))).not.toThrow();
  });

  it("keeps an item pending when its last assignee is removed during editing", async () => {
    const itemized: Expense = { ...expense, payerId: "fictional-sam", members: [], items: [
      { id: "fictional-item", name: "Fictional snack", amountCents: 1200, assigneeIds: ["fictional-alex"] },
    ] };
    const state = initial(); state.groups[0].expenses = [itemized]; bytes = JSON.stringify(state);
    const ui = mount(<AppProvider><ExpenseForm editingExpense={itemized} /><Probe /></AppProvider>);
    await ui.update();
    await event(() => observed.dispatch({ type: "REMOVE_PERSON", groupId: "fictional-trip", personId: "fictional-alex" }));
    await submit(ui);
    expect(observed.activeGroup!.expenses[0].amountCents).toBe(1200);
    expect(observed.activeGroup!.expenses[0].items![0].assigneeIds).toEqual([]);
    expect(() => validateState(JSON.parse(bytes))).not.toThrow();
  });

  it.each([10_001, 10_017])("does not accept and clear a %i-character person name that prevents every later save", async (length) => {
    const ui = await app();
    const name = "F".repeat(length);
    await change(ui, ui.one((n) => n.props["aria-label"] === "Person name"), name);
    await event(() => invoke(ui.one((n) => n.type === "form" && !n.props["aria-label"]), "onSubmit", { preventDefault: vi.fn() }));
    const acceptedInvalidState = observed.state;
    const draftAfter = ui.one((n) => n.props["aria-label"] === "Person name").props.value;
    // A valid subsequent edit must remain durable after rejecting the long name.
    await event(() => observed.dispatch({ type: "RENAME_GROUP", groupId: "fictional-trip", name: "Fictional later edit" }));
    expect.soft(() => validateState(acceptedInvalidState), "UI accepted an unsavable person").not.toThrow();
    expect.soft(draftAfter === name, "the rejected person name draft was cleared").toBe(true);
    expect.soft(JSON.parse(bytes).groups[0].name, "later valid edits also fail to persist").toBe("Fictional later edit");
  });

  it.each([9_999, 10_000])("persists a supported %i-character person name", async (length) => {
    const ui = await app(); const name = "F".repeat(length);
    await change(ui, ui.one((n) => n.props["aria-label"] === "Person name"), name);
    await event(() => invoke(ui.one((n) => n.type === "form" && !n.props["aria-label"]), "onSubmit", { preventDefault: vi.fn() }));
    expect(JSON.parse(bytes).groups[0].people.slice(-1)[0].name).toBe(name);
    expect(() => validateState(observed.state)).not.toThrow();
  });

  it("retains an invalid person rename and saves a corrected retry", async () => {
    const ui = await app();
    const label = "Rename Fictional Alex";
    await event(() => invoke(ui.one((n) => n.type === "button" && n.props["aria-label"] === label), "onClick"));
    const renameInput = () => ui.one((n) => n.type === "input" && n.props["aria-label"] === label);
    const unsupported = "F".repeat(10_001);
    await change(ui, renameInput(), unsupported);
    await event(() => invoke(ui.one((n) => n.props["aria-label"] === "Save name"), "onClick"));
    expect(observed.activeGroup!.people[0].name).toBe("Fictional Alex");
    expect(renameInput().props.value).toBe(unsupported);
    expect(ui.nodes((n) => n.props.role === "alert")).toHaveLength(1);
    await change(ui, renameInput(), "Fictional Aster");
    await event(() => invoke(ui.one((n) => n.props["aria-label"] === "Save name"), "onClick"));
    expect(JSON.parse(bytes).groups[0].people[0].name).toBe("Fictional Aster");
    expect(ui.nodes((n) => n.type === "input" && n.props["aria-label"] === label)).toEqual([]);
  });

  it.each(["add", "rename"])("rejects an overlong group name during %s before accepting unsavable state", async (operation) => {
    const ui = await app();
    vi.mocked(window.prompt).mockReturnValueOnce("F".repeat(10_001));
    await event(() => invoke(button(ui, operation === "add" ? "+ New group" : "Rename"), "onClick"));
    expect(() => validateState(observed.state)).not.toThrow();
  });

  it.each(["add", "rename"])("retains the rejected %s group prompt through cancellation and corrected retry", async (operation) => {
    const ui = await app();
    const unsupported = "F".repeat(10_001);
    vi.mocked(window.prompt).mockReturnValueOnce(unsupported);
    await event(() => invoke(button(ui, operation === "add" ? "+ New group" : "Rename"), "onClick"));
    expect(observed.state.groups).toHaveLength(2);
    expect(ui.nodes((n) => n.props.role === "alert")).toHaveLength(1);
    vi.mocked(window.prompt).mockReturnValueOnce(null);
    await event(() => invoke(button(ui, "Try name again"), "onClick"));
    expect(window.prompt).toHaveBeenLastCalledWith(expect.any(String), unsupported);
    expect(observed.state.groups).toHaveLength(2);
    vi.mocked(window.prompt).mockReturnValueOnce("Fictional corrected group");
    await event(() => invoke(button(ui, "Try name again"), "onClick"));
    expect(window.prompt).toHaveBeenLastCalledWith(expect.any(String), unsupported);
    expect(observed.activeGroup!.name).toBe("Fictional corrected group");
    expect(observed.state.groups).toHaveLength(operation === "add" ? 3 : 2);
    expect(ui.nodes((n) => n.props.role === "alert")).toEqual([]);
    expect(JSON.parse(bytes)).toEqual(observed.state);
  });

  it.each(["0001-01-01", "2000-02-29", "2026-01-01"])("saves canonical supported date %s", async (date) => {
    const ui = await app(); await fill(ui); await change(ui, field(ui, "-date"), date); await submit(ui);
    expect(observed.activeGroup!.expenses[0].date).toBe(date);
  });

  it.each(["2026-02-29", "2026-13-01", "10000-01-01"])("retains a programmatically invalid date draft %s after rejection", async (date) => {
    const ui = await app(); await fill(ui); await change(ui, field(ui, "-date"), date); await submit(ui);
    expect(observed.activeGroup!.expenses).toEqual([]);
    expect(field(ui, "-description").props.value).toBe("Fictional lunch");
  });
});
