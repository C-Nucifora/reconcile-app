import { act, createElement, StrictMode, useState, type ReactNode } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptViewer from "./ReceiptViewer";
import ReceiptUpload from "./ReceiptUpload";

const images = vi.hoisted(() => ({
  getImageURL: vi.fn(), compressImage: vi.fn(), putImage: vi.fn(), deleteUnusedImage: vi.fn(),
}));
vi.mock("../lib/imageStore", () => images);
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  createPortal: (children: ReactNode) => children,
}));

// Real hooks and effects, installed synthetic renderer. Portal transport, native
// focus, image decoding and DOM event delivery are outside this fixture.
interface Host {
  type: string;
  props: Record<string, unknown>;
  children: Host[];
  focus: () => void;
}
let doc: { activeElement: Host; body: Host };
function host(type: string, props: Host["props"] = {}): Host {
  const node: Host = { type, props, children: [], focus: vi.fn(() => { doc.activeElement = node; }) };
  return node;
}
function all(node: Host): Host[] { return [node, ...node.children.flatMap(all)]; }
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
const mounts: { unmount: () => Promise<void> }[] = [];
function mount(strict = false) {
  const container = host("ROOT");
  const root = renderer.createContainer(container);
  async function update(element: ReactNode) {
    const tree = createElement("audit-root", null, element);
    await act(async () => {
      renderer.updateContainer(strict ? createElement(StrictMode, null, tree) : tree, root, null, () => {});
    });
  }
  function nodes(predicate: (node: Host) => boolean) { return all(container).filter(predicate); }
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
function text(node: Host): string { return node.type === "#text" ? String(node.props.value) : node.children.map(text).join(""); }
function button(ui: Mounted, label: string) { return ui.one((node) => node.type === "button" && text(node) === label); }
function control(ui: Mounted, label: string) { return ui.one((node) => node.props["aria-label"] === label); }
function invoke(node: Host, handler: string) {
  expect(node.props[handler]).toBeTypeOf("function");
  return (node.props[handler] as () => unknown)();
}
async function event(callback: () => unknown) { await act(async () => { await callback(); }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
type Read = ReturnType<typeof deferred<string | null>>;
let reads: { id: string; pending: Read }[];
let keys: EventTarget;
let opener: Host;
const revokeURL = vi.fn();
const addKey = vi.fn();
const removeKey = vi.fn();
function listenerCount() { return addKey.mock.calls.length - removeKey.mock.calls.length; }
async function key(value: string, shiftKey = false) {
  const input = new Event("keydown", { cancelable: true });
  Object.defineProperties(input, { key: { value }, shiftKey: { value: shiftKey } });
  const stop = vi.spyOn(input, "stopPropagation");
  await event(() => keys.dispatchEvent(input));
  return { input, stop };
}
async function resolveRead(index: number, url: string | null) {
  expect(reads[index]).toBeDefined();
  await event(() => reads[index].pending.resolve(url));
}
function sources(ui: Mounted) { return ui.nodes((node) => node.type === "img").map((node) => node.props.src); }
function viewer(imageId: string, onClose: () => void) { return <ReceiptViewer imageId={imageId} onClose={onClose} />; }

// ExpenseList forgets the selected receipt when onClose runs. Keep that owner
// behavior here so cleanup assertions do not assume onClose unmounts by itself.
function OwnedViewer({ imageId, closed }: { imageId: string; closed: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? viewer(imageId, () => { closed(); setOpen(false); }) : null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  keys = new EventTarget();
  const add = keys.addEventListener.bind(keys);
  const remove = keys.removeEventListener.bind(keys);
  addKey.mockReset().mockImplementation(add);
  removeKey.mockReset().mockImplementation(remove);
  vi.stubGlobal("window", { addEventListener: addKey, removeEventListener: removeKey });
  opener = host("button", { "aria-label": "Fictional receipt opener" });
  doc = { activeElement: opener, body: host("body") };
  vi.stubGlobal("document", doc);
  revokeURL.mockReset();
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeURL);
  reads = [];
  Object.values(images).forEach((mock) => mock.mockReset());
  images.getImageURL.mockImplementation((id: string) => {
    const pending = deferred<string | null>();
    reads.push({ id, pending });
    return pending.promise;
  });
  images.deleteUnusedImage.mockResolvedValue(undefined);
});
afterEach(async () => {
  try {
    for (const ui of mounts.splice(0)) await ui.unmount();
    expect(removeKey.mock.calls).toEqual(addKey.mock.calls);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

describe("round8 receipt viewer async ownership", () => {
  it.each(["url", "missing"])("ignores a superseded %s result after the new receipt is ready", async (outcome) => {
    const closed = vi.fn();
    const ui = mount();
    await ui.update(viewer("fictional-a", closed));
    await ui.update(viewer("fictional-b", closed));
    await resolveRead(1, "blob:fictional-current-b");
    await resolveRead(0, outcome === "url" ? "blob:fictional-late-a" : null);
    expect(sources(ui)).toEqual(["blob:fictional-current-b"]);
    expect(closed).not.toHaveBeenCalled();
    expect(revokeURL.mock.calls).toEqual(outcome === "url" ? [["blob:fictional-late-a"]] : []);
    await ui.unmount();
    expect(revokeURL.mock.calls).toEqual([
      ...(outcome === "url" ? [["blob:fictional-late-a"]] : []), ["blob:fictional-current-b"],
    ]);
  });

  it("distinguishes three pending requests when ids cycle back to the first receipt", async () => {
    const closed = vi.fn();
    const ui = mount();
    for (const id of ["fictional-a", "fictional-b", "fictional-a"]) await ui.update(viewer(id, closed));
    expect(reads.map((read) => read.id)).toEqual(["fictional-a", "fictional-b", "fictional-a"]);
    await resolveRead(2, "blob:fictional-a-second-request");
    await resolveRead(0, "blob:fictional-a-first-request");
    await resolveRead(1, null);
    expect(sources(ui)).toEqual(["blob:fictional-a-second-request"]);
    expect(closed).not.toHaveBeenCalled();
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-a-first-request"]]);
    await ui.unmount();
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-a-first-request"], ["blob:fictional-a-second-request"]]);
  });

  it("does not reuse a revoked ready URL when the image id returns before another load completes", async () => {
    const closed = vi.fn();
    const ui = mount();
    await ui.update(<OwnedViewer imageId="fictional-a" closed={closed} />);
    await resolveRead(0, "blob:fictional-a-retired");
    await ui.update(<OwnedViewer imageId="fictional-b" closed={closed} />);
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-a-retired"]]);
    await ui.update(<OwnedViewer imageId="fictional-a" closed={closed} />);
    // Returning to the same id starts a new read and cannot resurrect its old URL.
    expect.soft(sources(ui), "a retired URL must stay out of the rendered image").toEqual([]);
    expect.soft(ui.nodes((node) => node.type === "p").map(text)).toContain("Loading receipt…");
    await resolveRead(1, null);
    expect(closed).not.toHaveBeenCalled();
    // Deliver an error only to an image still rendered now, never a detached
    // element's saved callback. A fixed viewer has no image at this point.
    const retired = ui.nodes((node) => node.type === "img" && node.props.src === "blob:fictional-a-retired");
    if (retired.length) await event(() => invoke(retired[0], "onError"));
    expect.soft(closed, "a revoked prior URL must not close the new request").not.toHaveBeenCalled();
    await resolveRead(2, "blob:fictional-a-fresh");
    expect.soft(sources(ui)).toEqual(["blob:fictional-a-fresh"]);
    await ui.unmount();
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-a-retired"], ["blob:fictional-a-fresh"]]);
  });

  it("revokes the discarded StrictMode read without revoking the live replay result", async () => {
    const closed = vi.fn();
    const ui = mount(true);
    await ui.update(viewer("fictional-replay", closed));
    expect(reads.map((read) => read.id), "viewer effect must actually replay").toEqual(["fictional-replay", "fictional-replay"]);
    expect(listenerCount()).toBe(1);
    await resolveRead(1, "blob:fictional-replay-live");
    await resolveRead(0, "blob:fictional-replay-discarded");
    expect(sources(ui)).toEqual(["blob:fictional-replay-live"]);
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-replay-discarded"]]);
    await ui.unmount();
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-replay-discarded"], ["blob:fictional-replay-live"]]);
    expect(closed).not.toHaveBeenCalled();
  });

  it.each(["escape", "close", "backdrop"])("cleans up a pending read after its owner closes by %s", async (action) => {
    const closed = vi.fn();
    const ui = mount();
    await ui.update(<OwnedViewer imageId="fictional-pending" closed={closed} />);
    expect(doc.activeElement).toBe(button(ui, "Close"));
    if (action === "escape") expect((await key("Escape")).stop).toHaveBeenCalledOnce();
    else await event(() => invoke(action === "close" ? button(ui, "Close") : control(ui, "Close receipt"), "onClick"));
    expect(closed).toHaveBeenCalledOnce();
    expect(ui.nodes((node) => node.props.role === "dialog")).toEqual([]);
    expect(doc.activeElement).toBe(opener);
    expect(listenerCount()).toBe(0);
    await resolveRead(0, "blob:fictional-after-close");
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-after-close"]]);
    expect((await key("Tab")).input.defaultPrevented).toBe(false);
    await key("Escape");
    expect(closed).toHaveBeenCalledOnce();
  });

  it.each(["url", "missing"])("does not let an unmounted instance's late %s affect a reopened receipt", async (outcome) => {
    const oldClose = vi.fn(); const currentClose = vi.fn();
    const ui = mount();
    await ui.update(viewer("fictional-same-id", oldClose));
    await ui.unmount();
    await ui.update(viewer("fictional-same-id", currentClose));
    await resolveRead(1, "blob:fictional-reopened");
    await resolveRead(0, outcome === "url" ? "blob:fictional-old-instance" : null);
    expect(sources(ui)).toEqual(["blob:fictional-reopened"]);
    expect(oldClose).not.toHaveBeenCalled();
    expect(currentClose).not.toHaveBeenCalled();
    expect(revokeURL.mock.calls).toEqual(outcome === "url" ? [["blob:fictional-old-instance"]] : []);
    await ui.unmount();
    expect(revokeURL).toHaveBeenLastCalledWith("blob:fictional-reopened");
  });

  it("restores focus and removes the key listener when the current read reports missing", async () => {
    const closed = vi.fn();
    const ui = mount();
    await ui.update(<OwnedViewer imageId="fictional-missing" closed={closed} />);
    await resolveRead(0, null);
    expect(closed).toHaveBeenCalledOnce();
    expect(listenerCount()).toBe(0);
    expect(doc.activeElement).toBe(opener);
    expect(revokeURL).not.toHaveBeenCalled();
    expect((await key("Tab")).input.defaultPrevented).toBe(false);
  });
});

describe("round8 receipt keyboard effect lifetime", () => {
  it("uses the latest close callback without reloading the URL and releases focus on unmount", async () => {
    const firstClose = vi.fn(); const latestClose = vi.fn();
    const ui = mount();
    await ui.update(viewer("fictional-stable", firstClose));
    await resolveRead(0, "blob:fictional-stable");
    await ui.update(viewer("fictional-stable", latestClose));
    await ui.update(viewer("fictional-stable", latestClose));
    expect(images.getImageURL).toHaveBeenCalledExactlyOnceWith("fictional-stable");
    expect(revokeURL).not.toHaveBeenCalled();
    expect(listenerCount()).toBe(1);
    expect(doc.activeElement).toBe(button(ui, "Close"));
    expect((await key("ArrowRight")).input.defaultPrevented).toBe(false);
    for (const shift of [false, true]) {
      opener.focus();
      expect((await key("Tab", shift)).input.defaultPrevented).toBe(true);
      expect(doc.activeElement).toBe(button(ui, "Close"));
    }
    expect((await key("Escape")).stop).toHaveBeenCalledOnce();
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
    await ui.unmount();
    expect(doc.activeElement).toBe(opener);
    expect(listenerCount()).toBe(0);
    await key("Escape");
    expect(latestClose).toHaveBeenCalledOnce();
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-stable"]]);
  });
});

describe("round8 nearby receipt upload lightbox", () => {
  it("keeps a closed lightbox's URL alive for its thumbnail until removal", async () => {
    const changed = vi.fn();
    const ui = mount();
    await ui.update(<ReceiptUpload imageId="fictional-upload" onChange={changed} />);
    await resolveRead(0, "blob:fictional-upload");
    const thumbnail = control(ui, "View receipt photo");
    thumbnail.focus();
    await event(() => invoke(thumbnail, "onClick"));
    expect(doc.activeElement).toBe(control(ui, "Close"));
    expect(listenerCount()).toBe(1);
    await key("Escape");
    expect(doc.activeElement).toBe(thumbnail);
    expect(listenerCount()).toBe(0);
    expect(revokeURL).not.toHaveBeenCalled();
    expect(sources(ui)).toEqual(["blob:fictional-upload"]);
    await event(() => invoke(button(ui, "View"), "onClick"));
    expect(listenerCount()).toBe(1);
    await event(() => invoke(button(ui, "Remove"), "onClick"));
    expect(changed).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(listenerCount()).toBe(0);
    await ui.update(<ReceiptUpload onChange={changed} />);
    expect(sources(ui)).toEqual([]);
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-upload"]]);
    expect(images.deleteUnusedImage).not.toHaveBeenCalled();
  });

  it("does not resurrect a revoked thumbnail or lightbox when an id returns during replacement", async () => {
    const changed = vi.fn();
    const ui = mount();
    await ui.update(<ReceiptUpload imageId="fictional-a" onChange={changed} />);
    await resolveRead(0, "blob:fictional-upload-retired");
    control(ui, "View receipt photo").focus();
    await event(() => invoke(button(ui, "View"), "onClick"));
    await ui.update(<ReceiptUpload imageId="fictional-b" onChange={changed} />);
    expect(listenerCount()).toBe(0);
    expect(revokeURL.mock.calls).toEqual([["blob:fictional-upload-retired"]]);
    await ui.update(<ReceiptUpload imageId="fictional-a" onChange={changed} />);
    expect.soft(sources(ui), "both thumbnail and lightbox must wait for a live URL").toEqual([]);
    expect.soft(ui.nodes((node) => node.props.role === "dialog")).toEqual([]);
    expect.soft(listenerCount()).toBe(0);
    await resolveRead(1, "blob:fictional-upload-stale-b");
    await resolveRead(2, "blob:fictional-upload-fresh-a");
    expect(ui.one((node) => node.props.alt === "Receipt thumbnail").props.src).toBe("blob:fictional-upload-fresh-a");
    expect(sources(ui).every((src) => src === "blob:fictional-upload-fresh-a")).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    await ui.unmount();
    expect(revokeURL.mock.calls).toEqual([
      ["blob:fictional-upload-retired"], ["blob:fictional-upload-stale-b"], ["blob:fictional-upload-fresh-a"],
    ]);
  });
});
