import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { act, createElement, StrictMode, useEffect, useLayoutEffect } from "react";
import Reconciler from "@react-pdf/reconciler";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { THEME_KEY, type ThemeChoice } from "./theme";

// Real provider hooks and startup script, with synthetic storage/media/classes.
// This does not establish browser paint timing or native media event delivery.
type Host = { type: string; props: Record<string, unknown>; children: Host[] };
function remove(parent: Host, child: Host) {
  parent.children = parent.children.filter((node) => node !== child);
}
function append(parent: Host, child: Host) {
  remove(parent, child);
  parent.children.push(child);
}
const renderer = Reconciler({
  createInstance: (type: string, props: Host["props"]): Host => ({ type, props, children: [] }),
  createTextInstance: (value: string): Host => ({ type: "#text", props: { value }, children: [] }),
  appendChild: append,
  appendChildToContainer: append,
  insertBefore: (parent: Host, child: Host, before: Host) => {
    remove(parent, child);
    parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  removeChild: remove,
  removeChildFromContainer: remove,
  commitUpdate: (node: Host, _payload: unknown, _type: string, _old: unknown, props: Host["props"]) => { node.props = props; },
  commitTextUpdate: (node: Host, _old: string, value: string) => { node.props.value = value; },
  resetAfterCommit: () => {},
});

type Listener = (event: { matches: boolean }) => void;
function environment(stored: string | null = null, initialDark = false) {
  const bytes = new Map([["fictional.unrelated", "fictional ledger bytes"]]);
  if (stored !== null) bytes.set(THEME_KEY, stored);
  const access = { readDenied: false, writeDenied: false };
  const storage = {
    getItem: vi.fn((key: string) => {
      if (access.readDenied) throw new Error("fictional storage read denied");
      return bytes.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (access.writeDenied) throw new Error("fictional storage quota denied");
      bytes.set(key, value);
    }),
  };
  let dark = initialDark;
  const lists: Array<ReturnType<typeof mediaList>> = [];
  function mediaList() {
    const listeners = new Set<Listener>();
    return {
      get matches() { return dark; },
      listeners,
      addEventListener: vi.fn((type: string, listener: Listener) => {
        expect(type).toBe("change");
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: Listener) => {
        expect(type).toBe("change");
        listeners.delete(listener);
      }),
    };
  }
  // Browsers may return a fresh MediaQueryList for each identical query.
  const matchMedia = vi.fn((query: string) => {
    expect(query).toBe("(prefers-color-scheme: dark)");
    const list = mediaList();
    lists.push(list);
    return list;
  });
  const classes = new Set(["fictional-shell"]);
  const document = { documentElement: { classList: {
    add: (name: string) => { classes.add(name); },
    remove: (name: string) => { classes.delete(name); },
  } } };
  const window = { matchMedia };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  return {
    bytes, access, storage, matchMedia, lists, classes, window, document,
    listenerCount: () => lists.reduce((sum, list) => sum + list.listeners.size, 0),
    emit: (next: boolean) => {
      dark = next;
      for (const list of lists) for (const listener of [...list.listeners]) listener({ matches: next });
    },
  };
}
type Environment = ReturnType<typeof environment>;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  } finally {
    vi.unstubAllGlobals();
  }
});

async function mount(options: { strict?: boolean; beforeSubscribe?: () => void } = {}) {
  const { beforeSubscribe } = options;
  const host: Host = { type: "root", props: {}, children: [] };
  const root = renderer.createContainer(host);
  let current!: ReturnType<typeof useTheme>;
  const effects = vi.fn();
  function Probe() {
    const value = useTheme();
    useLayoutEffect(() => { beforeSubscribe?.(); }, []);
    useEffect(() => { current = value; }, [value]);
    useEffect(() => {
      effects("setup");
      return () => { effects("cleanup"); };
    }, []);
    return null;
  }
  let mounted = true;
  async function unmount() {
    if (!mounted) return;
    await act(async () => { renderer.updateContainer(null, root, null, () => {}); });
    mounted = false;
  }
  cleanups.push(unmount);
  const tree = createElement("audit-root", null, <ThemeProvider><Probe /></ThemeProvider>);
  await act(async () => {
    renderer.updateContainer(options.strict ? <StrictMode>{tree}</StrictMode> : tree, root, null, () => {});
  });
  return { value: () => current, effects, unmount };
}
type View = Awaited<ReturnType<typeof mount>>;
async function event(callback: () => void) { await act(async () => { callback(); }); }
function expectTheme(view: View, env: Environment, choice: ThemeChoice, resolved: "light" | "dark") {
  expect(view.value().theme).toBe(choice);
  expect(view.value().resolvedTheme).toBe(resolved);
  expect(env.classes.has("dark")).toBe(resolved === "dark");
  expect(env.classes.has("fictional-shell")).toBe(true);
  expect(env.bytes.get("fictional.unrelated")).toBe("fictional ledger bytes");
}

const startup = readFileSync(new URL("../../index.html", import.meta.url), "utf8").match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
function runStartup(env: Environment) {
  expect(startup, "audit must execute the actual inline startup script").toBeTypeOf("string");
  runInNewContext(startup!, { localStorage: env.storage, window: env.window, document: env.document }, { timeout: 1000 });
}

describe("round8 theme choices and system events", () => {
  it.each([
    ["light", true, "light"], ["dark", false, "dark"],
    ["system", true, "dark"], ["system", false, "light"],
  ] as const)("loads %s with OS dark=%s and persists the choice", async (choice, dark, resolved) => {
    const env = environment(choice, dark);
    const view = await mount();
    expectTheme(view, env, choice, resolved);
    expect(env.storage.setItem.mock.calls).toEqual([[THEME_KEY, choice]]);
    expect(env.listenerCount()).toBe(1);
  });

  it("follows repeated OS changes without replacing the stored system choice", async () => {
    const env = environment("system");
    const view = await mount();
    for (const dark of [true, false, false, true]) {
      await event(() => env.emit(dark));
      expectTheme(view, env, "system", dark ? "dark" : "light");
    }
    expect(env.storage.setItem.mock.calls).toEqual([[THEME_KEY, "system"]]);
    expect(env.listenerCount()).toBe(1);
  });

  it.each(["light", "dark"] as const)("keeps explicit %s while tracking the latest OS choice for system", async (choice) => {
    const env = environment(choice);
    const view = await mount();
    for (const dark of [true, false, true]) {
      await event(() => env.emit(dark));
      expectTheme(view, env, choice, choice);
    }
    expect(env.storage.setItem.mock.calls).toEqual([[THEME_KEY, choice]]);
    await event(() => view.value().setTheme("system"));
    expectTheme(view, env, "system", "dark");
    expect(env.storage.setItem.mock.calls).toEqual([[THEME_KEY, choice], [THEME_KEY, "system"]]);
  });

  it("cycles captured handlers in order and restores the durable choice on remount", async () => {
    const env = environment("system", true);
    const first = await mount();
    const cycle = first.value().cycle;
    for (const choice of ["light", "dark", "system"] as const) {
      await event(cycle);
      expectTheme(first, env, choice, choice === "light" ? "light" : "dark");
      expect(env.bytes.get(THEME_KEY)).toBe(choice);
    }
    await event(() => { cycle(); cycle(); });
    expectTheme(first, env, "dark", "dark");
    await first.unmount();
    const second = await mount();
    expectTheme(second, env, "dark", "dark");
    await event(() => env.emit(false));
    expectTheme(second, env, "dark", "dark");
  });

  it("catches an OS change between initialization and passive listener attachment", async () => {
    const env = environment("system", false);
    const view = await mount({ beforeSubscribe: () => {
      expect(env.listenerCount()).toBe(0);
      env.emit(true);
    } });
    // A current OS snapshot must not stay stale until another OS change.
    expectTheme(view, env, "system", "dark");
    expect(env.bytes.get(THEME_KEY)).toBe("system");
  });
});

describe("round8 storage fallback and startup recovery", () => {
  it.each([null, "", "DARK", " dark ", '"dark"', '{"theme":"dark"}', "fictional-corrupt"])(
    "recovers missing or invalid stored choice %j to system", async (raw) => {
      const env = environment(raw, true);
      const view = await mount();
      expectTheme(view, env, "system", "dark");
      expect(env.bytes.get(THEME_KEY)).toBe("system");
      expect(env.storage.setItem.mock.calls).toEqual([[THEME_KEY, "system"]]);
    },
  );

  it.each(["read", "write", "both", "missing"])("keeps controls usable with %s storage unavailable", async (failure) => {
    const env = environment(null, true);
    env.access.readDenied = failure === "read" || failure === "both";
    env.access.writeDenied = failure === "write" || failure === "both";
    if (failure === "missing") vi.stubGlobal("localStorage", undefined);
    const view = await mount();
    expectTheme(view, env, "system", "dark");
    await event(() => view.value().setTheme("light"));
    expectTheme(view, env, "light", "light");
    expect(env.bytes.get(THEME_KEY)).toBe(failure === "read" ? "light" : undefined);
    await event(() => env.emit(false));
    await event(() => view.value().setTheme("system"));
    expectTheme(view, env, "system", "light");
    // Recovery is tested on the next choice, without requiring an automatic retry.
    env.access.readDenied = false;
    env.access.writeDenied = false;
    vi.stubGlobal("localStorage", env.storage);
    await event(() => view.value().setTheme("dark"));
    expectTheme(view, env, "dark", "dark");
    expect(env.bytes.get(THEME_KEY)).toBe("dark");
    await view.unmount();
    expectTheme(await mount(), env, "dark", "dark");
  });

  it.each(["missing", "throws"])("falls back to light when matchMedia %s and still honors explicit dark", async (failure) => {
    const env = environment("system", true);
    vi.stubGlobal("window", failure === "missing" ? {} : { matchMedia: () => { throw new Error("fictional media denial"); } });
    const view = await mount();
    expectTheme(view, env, "system", "light");
    expect(env.listenerCount()).toBe(0);
    await event(() => view.value().setTheme("dark"));
    expectTheme(view, env, "dark", "dark");
    await view.unmount();
    vi.stubGlobal("window", env.window);
    env.bytes.set(THEME_KEY, "system");
    expectTheme(await mount(), env, "system", "dark");
  });

  it("restores the last durable choice after an unsaved in-memory choice is unmounted", async () => {
    const env = environment("dark", true);
    env.access.writeDenied = true;
    const view = await mount();
    await event(() => view.value().setTheme("light"));
    expectTheme(view, env, "light", "light");
    expect(env.bytes.get(THEME_KEY)).toBe("dark");
    await view.unmount();
    expectTheme(await mount(), env, "dark", "dark");
    expect(env.bytes.get(THEME_KEY)).toBe("dark");
  });

  it.each([
    [null, true, "system", "dark"], ["system", false, "system", "light"],
    ["light", true, "light", "light"], ["dark", false, "dark", "dark"],
  ] as const)("keeps startup and provider aligned for %j with OS dark=%s", async (raw, dark, choice, resolved) => {
    const env = environment(raw, dark);
    env.classes.add("dark");
    runStartup(env);
    expect(env.classes.has("dark")).toBe(resolved === "dark");
    expect(env.storage.setItem).not.toHaveBeenCalled();
    expectTheme(await mount(), env, choice, resolved);
  });

  it("recovers from the documented light startup fallback when storage reads are denied", async () => {
    const env = environment(null, true);
    env.access.readDenied = true;
    env.classes.add("dark");
    expect(() => runStartup(env)).not.toThrow();
    expect(env.classes.has("dark")).toBe(false);
    expectTheme(await mount(), env, "system", "dark");
  });

  it("uses the same invalid-choice default before startup paint and after provider mount", async () => {
    const env = environment("fictional-corrupt", true);
    runStartup(env);
    const startupDark = env.classes.has("dark");
    const view = await mount();
    expectTheme(view, env, "system", "dark");
    expect(startupDark, "startup must share the provider's system default for invalid choices").toBe(true);
  });
});

describe("round8 listener ownership and replay", () => {
  it("releases only its own callback on the same MediaQueryList through four remounts", async () => {
    const env = environment("system");
    for (let round = 0; round < 4; round++) {
      const view = await mount();
      const subscribed = env.lists.filter((list) => list.listeners.size > 0);
      expect(subscribed).toHaveLength(1);
      const list = subscribed[0];
      const owned = [...list.listeners][0];
      const foreign = vi.fn();
      list.addEventListener("change", foreign);
      await event(() => env.emit(true));
      expectTheme(view, env, "system", "dark");
      const writes = env.storage.setItem.mock.calls.length;
      await view.unmount();
      expect(list.removeEventListener.mock.calls).toEqual([["change", owned]]);
      expect(list.listeners).toEqual(new Set([foreign]));
      await event(() => env.emit(false));
      expect(foreign).toHaveBeenLastCalledWith({ matches: false });
      expect(env.classes.has("dark")).toBe(true);
      expect(env.storage.setItem).toHaveBeenCalledTimes(writes);
      list.removeEventListener("change", foreign);
      expect(env.listenerCount()).toBe(0);
    }
  });

  it("establishes StrictMode replay before checking one live subscription and final cleanup", async () => {
    const env = environment("system");
    const view = await mount({ strict: true });
    expect(view.effects.mock.calls, "Harness limitation if setup/cleanup/setup is absent").toEqual([["setup"], ["cleanup"], ["setup"]]);
    expect(env.listenerCount()).toBe(1);
    expect(env.lists.flatMap((list) => list.addEventListener.mock.calls)).toHaveLength(2);
    expect(env.lists.flatMap((list) => list.removeEventListener.mock.calls)).toHaveLength(1);
    await event(() => env.emit(true));
    expectTheme(view, env, "system", "dark");
    await event(() => view.value().setTheme("light"));
    await event(() => env.emit(false));
    await event(() => env.emit(true));
    expectTheme(view, env, "light", "light");
    await event(() => view.value().setTheme("system"));
    expectTheme(view, env, "system", "dark");
    await view.unmount();
    expect(view.effects.mock.calls).toEqual([["setup"], ["cleanup"], ["setup"], ["cleanup"]]);
    expect(env.listenerCount()).toBe(0);
    for (const list of env.lists) expect(list.removeEventListener.mock.calls).toEqual(list.addEventListener.mock.calls);
  });
});
