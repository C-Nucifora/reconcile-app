import { act, createElement, type ReactElement, type ReactNode } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildReport, type ReportData } from "../export/report";
import type { Group } from "../types";
import ExportModal from "./ExportModal";

const rendering = vi.hoisted(() => ({ pdf: vi.fn(), toBlob: vi.fn() }));
vi.mock("@react-pdf/renderer", () => ({ pdf: rendering.pdf }));
vi.mock("../export/ReconcilePdf", () => ({ ReconcilePdf: () => null }));
vi.mock("../export/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export/report")>();
  return { ...actual, buildReport: vi.fn(actual.buildReport) };
});

// Hooks, effects and report calculation are real. Host events, download APIs and
// PDF rendering are controlled boundaries; this does not establish native focus
// behavior, browser download consumption or renderer/font network behavior.
interface Host {
  type: string;
  props: Record<string, unknown>;
  children: Host[];
  focus: () => void;
  querySelector: (selector: string) => Host | null;
  querySelectorAll: (selector: string) => Host[];
  contains: (node: Host) => boolean;
}
function all(node: Host): Host[] { return [node, ...node.children.flatMap(all)]; }
function host(type: string, props: Host["props"]): Host {
  const node: Host = {
    type, props, children: [], focus: vi.fn(),
    querySelector: (selector) => node.querySelectorAll(selector)[0] ?? null,
    querySelectorAll: (selector) => all(node).filter((n) =>
      (n.type === "button" || (selector.includes("input") && n.type === "input")) &&
      (!selector.includes(":disabled") || !n.props.disabled)),
    contains: (child) => all(node).includes(child),
  };
  return node;
}
function detach(parent: Host, child: Host) {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
}
function append(parent: Host, child: Host) { detach(parent, child); parent.children.push(child); }
const renderer = Reconciler({
  createInstance: host,
  createTextInstance: (value: string) => host("#text", { value }),
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
const mounts: { update: (element?: ReactNode) => Promise<void> }[] = [];
function mount() {
  const container = host("ROOT", {});
  const root = renderer.createContainer(container);
  async function update(element: ReactNode = null) {
    await act(async () => { renderer.updateContainer(createElement("audit-root", null, element), root, null, () => {}); });
  }
  function one(predicate: (node: Host) => boolean) {
    const matches = all(container).filter(predicate);
    expect(matches).toHaveLength(1);
    return matches[0];
  }
  const ui = { update, one, nodes: () => all(container) };
  mounts.push(ui);
  return ui;
}
type Mounted = ReturnType<typeof mount>;
function text(node: Host): string { return node.type === "#text" ? String(node.props.value) : node.children.map(text).join(""); }
function button(ui: Mounted, label: string) { return ui.one((n) => n.type === "button" && text(n) === label); }
function invoke(node: Host, handler: string): unknown {
  expect(node.props[handler]).toBeTypeOf("function");
  return (node.props[handler] as () => unknown)();
}
async function event(callback: () => unknown) { await act(async () => { await callback(); }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const group: Group = {
  id: "fictional-trip", name: "Fictional trip",
  people: [{ id: "fictional-alex", name: "Fictional Alex" }],
  expenses: [{ id: "fictional-expense", description: "Fictional picnic", amountCents: 123,
    payerId: "fictional-alex", date: "2026-11-12", splitType: "equal",
    members: [{ personId: "fictional-alex", value: 0 }], receiptImageId: "fictional-private-receipt-id" }],
};
const blob = new Blob(["fictional PDF bytes"], { type: "application/pdf" });
const createURL = vi.fn();
const revokeURL = vi.fn();
const appendAnchor = vi.fn();
const click = vi.fn();
const remove = vi.fn();
const network = vi.fn();
const stored = vi.fn();
const timeouts: { callback: () => void; delay: number }[] = [];
let anchors: { href: string; download: string; click: typeof click; remove: typeof remove }[];
let keys: EventTarget;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(buildReport).mockClear();
  rendering.pdf.mockReset().mockReturnValue({ toBlob: rendering.toBlob });
  rendering.toBlob.mockReset().mockResolvedValue(blob);
  createURL.mockReset().mockImplementation(() => `blob:fictional-export-${createURL.mock.calls.length}`);
  revokeURL.mockReset(); appendAnchor.mockReset(); click.mockReset(); remove.mockReset();
  network.mockReset().mockImplementation(() => { throw new Error("unexpected network access"); });
  stored.mockReset().mockImplementation(() => { throw new Error("unexpected storage access"); });
  anchors = []; timeouts.length = 0; keys = new EventTarget();
  vi.stubGlobal("window", {
    addEventListener: keys.addEventListener.bind(keys), removeEventListener: keys.removeEventListener.bind(keys),
    setTimeout: (callback: () => void, delay: number) => { timeouts.push({ callback, delay }); return timeouts.length; },
  });
  vi.stubGlobal("document", {
    activeElement: { focus: vi.fn() }, body: { appendChild: appendAnchor },
    createElement: (type: string) => {
      expect(type).toBe("a");
      const anchor = { href: "", download: "", click, remove };
      anchors.push(anchor);
      return anchor;
    },
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation(createURL);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeURL);
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("XMLHttpRequest", network);
  vi.stubGlobal("navigator", { sendBeacon: network });
  vi.stubGlobal("localStorage", { getItem: stored, setItem: stored });
  vi.stubGlobal("indexedDB", { open: stored });
});
afterEach(async () => {
  for (const ui of mounts.splice(0)) await ui.update();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function open(onClose = vi.fn()) {
  const ui = mount();
  await ui.update(<ExportModal group={group} onClose={onClose} />);
  return { ui, onClose };
}
async function selectOnly(ui: Mounted, index: number) {
  const inputs = ui.nodes().filter((n) => n.type === "input");
  expect(inputs).toHaveLength(3);
  for (let i = 0; i < inputs.length; i++) if (i !== index) await event(() => invoke(inputs[i], "onChange"));
}
async function start(ui: Mounted) {
  let completion!: Promise<void>;
  await act(async () => { completion = invoke(button(ui, "Download"), "onClick") as Promise<void>; });
  return { finish: () => event(() => completion) };
}
function report(): ReportData {
  expect(rendering.pdf).toHaveBeenCalledOnce();
  return (rendering.pdf.mock.calls[0][0] as ReactElement<{ data: ReportData }>).props.data;
}
function finishTimeouts() {
  for (const timeout of timeouts.splice(0)) {
    expect(timeout.delay).toBe(1000);
    timeout.callback();
  }
}

describe("round2 export audit with live hooks and report calculation", () => {
  it.each(["report", "renderer", "blob", "url", "append", "click"])("retains choices and permits retry after a %s fault", async (stage) => {
    const fault = new Error(`fictional ${stage} fault`);
    if (stage === "report") vi.mocked(buildReport).mockImplementationOnce(() => { throw fault; });
    if (stage === "renderer") rendering.pdf.mockImplementationOnce(() => { throw fault; });
    if (stage === "blob") rendering.toBlob.mockRejectedValueOnce(fault);
    if (stage === "url") createURL.mockImplementationOnce(() => { throw fault; });
    if (stage === "append") appendAnchor.mockImplementationOnce(() => { throw fault; });
    if (stage === "click") click.mockImplementationOnce(() => { throw fault; });
    const { ui, onClose } = await open();
    await selectOnly(ui, 1);
    await (await start(ui)).finish();
    expect(text(ui.one((n) => n.props.role === "alert"))).toContain("Please try again");
    expect(button(ui, "Download").props.disabled).toBe(false);
    expect(ui.nodes().filter((n) => n.type === "input").map((n) => [n.props.checked, n.props.disabled]))
      .toEqual([[false, false], [true, false], [false, false]]);
    expect(onClose).not.toHaveBeenCalled();
    const allocatedBeforeRetry = stage === "append" || stage === "click";
    expect(remove).toHaveBeenCalledTimes(allocatedBeforeRetry ? 1 : 0);
    expect(revokeURL).not.toHaveBeenCalled();
    finishTimeouts();
    expect(revokeURL).toHaveBeenCalledTimes(allocatedBeforeRetry ? 1 : 0);
    await (await start(ui)).finish();
    expect(ui.nodes().filter((n) => n.props.role === "alert")).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledTimes(stage === "click" ? 2 : 1);
    const calls = rendering.pdf.mock.calls;
    const last = calls[calls.length - 1][0] as ReactElement<{ data: ReportData }>;
    expect(Object.keys(last.props.data).sort()).toEqual(["expenses", "header"]);
    finishTimeouts();
    expect(revokeURL).toHaveBeenCalledTimes(allocatedBeforeRetry ? 2 : 1);
  });

  it.each([0, 1, 2])("passes only section %i to the renderer without receipt or storage access", async (index) => {
    const { ui, onClose } = await open();
    await selectOnly(ui, index);
    await (await start(ui)).finish();
    const data = report();
    expect(Object.keys(data).sort()).toEqual(["header", ["settleUp", "expenses", "perPerson"][index]].sort());
    expect(data.header.groupName).toBe(group.name);
    expect(JSON.stringify(data)).not.toContain("fictional-private-receipt-id");
    expect(network).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();
    expect(createURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].href).toBe("blob:fictional-export-1");
    expect(anchors[0].download).toMatch(/^Reconcile - Fictional trip - \d{4}-\d{2}-\d{2}\.pdf$/);
    expect(onClose).toHaveBeenCalledOnce();
    finishTimeouts();
    expect(revokeURL).toHaveBeenCalledExactlyOnceWith("blob:fictional-export-1");
  });

  it("guards an empty selection even when a disabled button handler is invoked", async () => {
    const { ui, onClose } = await open();
    for (const input of ui.nodes().filter((n) => n.type === "input")) await event(() => invoke(input, "onChange"));
    expect(button(ui, "Download").props.disabled).toBe(true);
    await (await start(ui)).finish();
    expect(buildReport).not.toHaveBeenCalled();
    expect(rendering.pdf).not.toHaveBeenCalled();
    expect(createURL).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("deduplicates captured clicks and exports the clicked snapshot across a same-group prop update", async () => {
    const pending = deferred<Blob>(); rendering.toBlob.mockReturnValueOnce(pending.promise);
    const { ui, onClose } = await open();
    await selectOnly(ui, 1);
    const download = button(ui, "Download");
    let first!: Promise<void>;
    await act(async () => {
      first = invoke(download, "onClick") as Promise<void>;
      for (let i = 0; i < 4; i++) await invoke(download, "onClick");
    });
    await vi.waitFor(() => expect(rendering.toBlob).toHaveBeenCalledOnce(), { timeout: 1000, interval: 5 });
    expect(button(ui, "Generating…").props.disabled).toBe(true);
    expect(ui.nodes().filter((n) => n.type === "input").every((n) => n.props.disabled)).toBe(true);
    await ui.update(<ExportModal group={{ ...group, name: "Fictional later edit", expenses: [] }} onClose={() => onClose()} />);
    expect(report().header.groupName).toBe(group.name);
    expect(report().expenses?.[0].description).toBe("Fictional picnic");
    await event(() => pending.resolve(blob)); await event(() => first);
    expect(buildReport).toHaveBeenCalledOnce();
    expect(anchors[0].download).toMatch(/^Reconcile - Fictional trip - /);
    expect(onClose).toHaveBeenCalledOnce();
    finishTimeouts();
  });

  it.each(["resolve", "reject"])("isolates an old %s completion from a reopened modal and its pending retry", async (outcome) => {
    const old = deferred<Blob>(); const fresh = deferred<Blob>();
    rendering.toBlob.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { ui, onClose } = await open();
    await selectOnly(ui, 1);
    const first = await start(ui);
    await vi.waitFor(() => expect(rendering.toBlob).toHaveBeenCalledOnce(), { timeout: 1000, interval: 5 });
    await event(() => invoke(button(ui, "Cancel"), "onClick"));
    await ui.update();
    const newClose = vi.fn();
    await ui.update(<ExportModal group={group} onClose={newClose} />);
    expect(ui.nodes().filter((n) => n.type === "input").map((n) => n.props.checked)).toEqual([true, true, true]);
    const second = await start(ui);
    await vi.waitFor(() => expect(rendering.toBlob).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 5 });
    await event(() => outcome === "resolve" ? old.resolve(blob) : old.reject(new Error("fictional stale failure")));
    await first.finish();
    expect(button(ui, "Generating…").props.disabled).toBe(true);
    expect(ui.nodes().filter((n) => n.props.role === "alert")).toEqual([]);
    expect(newClose).not.toHaveBeenCalled();
    expect(createURL).not.toHaveBeenCalled();
    await event(() => fresh.resolve(blob)); await second.finish();
    expect(onClose).toHaveBeenCalledOnce();
    expect(newClose).toHaveBeenCalledOnce();
    expect(createURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    finishTimeouts();
  });

  it("removes the replaced callback's Escape listener and does not close after unmount", async () => {
    const firstClose = vi.fn(); const secondClose = vi.fn();
    const { ui } = await open(firstClose);
    await ui.update(<ExportModal group={group} onClose={secondClose} />);
    function escape() { const key = new Event("keydown"); Object.defineProperty(key, "key", { value: "Escape" }); keys.dispatchEvent(key); }
    await event(escape);
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledOnce();
    await ui.update();
    await event(escape);
    expect(secondClose).toHaveBeenCalledOnce();
  });
});
