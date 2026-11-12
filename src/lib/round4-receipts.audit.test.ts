import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../types";

type Images = typeof import("./imageStore");
type Callback = (() => void) | null;

// Writes stay private until commit. Request success alone never mutates storage.
function controlledStorage() {
  const blobs = new Map<string, Blob>();
  const writes: ReturnType<typeof transaction>[] = [];
  const reads: ReturnType<typeof transaction>[] = [];
  const local = { raw: null as string | null };
  const control = { holdOpen: false };

  function transaction() {
    let apply = () => {};
    let finished = false;
    let succeeded = false;
    const request = {
      result: undefined as Blob | undefined,
      error: new Error("Fictional request failure"),
      onsuccess: null as Callback,
      onerror: null as Callback,
    };
    const tx = {
      error: new Error("Fictional transaction failure"),
      oncomplete: null as Callback,
      onerror: null as Callback,
      onabort: null as Callback,
      objectStore: () => ({
        put: (blob: Blob, id: string) => {
          apply = () => { blobs.set(id, blob); };
          return request;
        },
        delete: (id: string) => {
          apply = () => { blobs.delete(id); };
          return request;
        },
        get: (id: string) => {
          request.result = blobs.get(id);
          return request;
        },
      }),
      requestSuccess: () => {
        expect(finished).toBe(false);
        expect(succeeded).toBe(false);
        succeeded = true;
        request.onsuccess?.();
      },
      commit: () => {
        expect(finished).toBe(false);
        if (!succeeded) tx.requestSuccess();
        finished = true;
        apply();
        tx.oncomplete?.();
      },
      fail: (cause: "abort" | "error" = "abort") => {
        expect(finished).toBe(false);
        finished = true;
        if (cause === "error") {
          expect(succeeded).toBe(false);
          request.onerror?.();
          tx.onerror?.();
        }
        tx.onabort?.();
      },
    };
    return tx;
  }

  function connection() {
    let closed = false;
    const db = {
      objectStoreNames: { contains: () => true },
      onclose: null as Callback,
      onversionchange: null as Callback,
      close: () => { closed = true; },
      forceClose: () => { closed = true; db.onclose?.(); },
      transaction: (_store: string, mode: string) => {
        if (closed) throw new Error("Fictional closed connection");
        const tx = transaction();
        (mode === "readwrite" ? writes : reads).push(tx);
        return tx;
      },
    };
    return db;
  }
  const connections: ReturnType<typeof connection>[] = [];
  const opens: { onsuccess: Callback }[] = [];
  const open = vi.fn(() => {
    const db = connection();
    connections.push(db);
    const request = { result: db, onsuccess: null as Callback };
    opens.push(request);
    if (!control.holdOpen) queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  vi.stubGlobal("localStorage", { getItem: () => local.raw });
  return { blobs, writes, reads, local, control, connections, opens, open };
}

async function flush() {
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
}

const photo = () => new Blob(["fictional round four photo"], { type: "image/jpeg" });

async function upload(images: Images, fake: ReturnType<typeof controlledStorage>) {
  const index = fake.writes.length;
  const pending = images.putImage(photo());
  await flush();
  expect(fake.writes).toHaveLength(index + 1);
  fake.writes[index].commit();
  return pending;
}

function savedReferences(idsByGroup: string[][]): AppState {
  return {
    schemaVersion: 1,
    activeGroupId: idsByGroup.length ? "fictional-group-0" : null,
    groups: idsByGroup.map((ids, group) => ({
      id: `fictional-group-${group}`,
      name: `Fictional group ${group}`,
      people: [{ id: "fictional-person", name: "Fictional Pat" }],
      expenses: ids.map((id, expense) => ({
        id: `fictional-expense-${expense}`,
        description: "Fictional receipt expense",
        date: "2026-11-12",
        amountCents: 100,
        payerId: "fictional-person",
        splitType: "equal" as const,
        members: [{ personId: "fictional-person", value: 1 }],
        receiptImageId: id,
      })),
    })),
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("round four receipt transaction and reference schedules", () => {
  it("keeps a successful put request pending until the transaction commits", async () => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const settled = vi.fn();
    const pending = images.putImage(photo()).then((id) => { settled(id); return id; });
    await flush();
    fake.writes[0].requestSuccess();
    await flush();
    expect(settled).not.toHaveBeenCalled();
    expect(fake.blobs.size).toBe(0);
    fake.writes[0].commit();
    const id = await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(id);
    expect(fake.blobs.has(id)).toBe(true);
  });

  it("rejects a write aborted after request success and accepts a fresh upload", async () => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const pending = images.putImage(photo());
    const rejected = expect(pending).rejects.toThrow("Fictional transaction failure");
    await flush();
    fake.writes[0].requestSuccess();
    fake.writes[0].fail();
    await rejected;
    expect(fake.blobs.size).toBe(0);
    const id = await upload(images, fake);
    expect([...fake.blobs.keys()]).toEqual([id]);
  });

  it("keeps cleanup pending and bytes intact until delete commit", async () => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const id = await upload(images, fake);
    const settled = vi.fn();
    const pending = images.deleteUnusedImage(id).then(settled);
    await flush();
    fake.writes[1].requestSuccess();
    await flush();
    expect(settled).not.toHaveBeenCalled();
    expect(fake.blobs.has(id)).toBe(true);
    fake.writes[1].commit();
    await pending;
    expect(fake.blobs.has(id)).toBe(false);
    await images.deleteUnusedImage(id);
    expect(fake.writes).toHaveLength(2);
  });

  it.each(["abort", "error"] as const)("retains an unpublished receipt after delete %s and retries cleanup", async (cause) => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const id = await upload(images, fake);
    const pending = images.deleteUnusedImage(id);
    await flush();
    if (cause === "abort") fake.writes[1].requestSuccess();
    fake.writes[1].fail(cause);
    await expect(pending).resolves.toBeUndefined();
    expect(fake.blobs.has(id)).toBe(true);
    const retry = images.deleteUnusedImage(id);
    await flush();
    expect(fake.writes).toHaveLength(3);
    fake.writes[2].commit();
    await retry;
    expect(fake.blobs.has(id)).toBe(false);
  });

  it.each(["active", "saved", "published"] as const)("rechecks %s protection before retrying a failed deletion", async (protection) => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const id = await upload(images, fake);
    const pending = images.deleteUnusedImage(id);
    await flush();
    fake.writes[1].fail();
    await pending;
    if (protection === "active") images.retainImageReferences(new Set([id]));
    if (protection === "saved") fake.local.raw = JSON.stringify(savedReferences([[], [id]]));
    if (protection === "published") images.commitImageReferences(new Set([id]));
    await images.deleteUnusedImage(id);
    expect(fake.writes).toHaveLength(2);
    expect(fake.blobs.has(id)).toBe(true);
  });

  it("protects saved references outside the active group and retains the published shared receipt after all removals", async () => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const id = await upload(images, fake);
    const { loadStoredState } = await import("../state/storage");
    for (const references of [[[id, id], [id]], [[id], [id]], [[], [id]]]) {
      fake.local.raw = JSON.stringify(savedReferences(references));
      expect(loadStoredState().error).toBeNull();
      await images.deleteUnusedImage(id);
      expect(fake.writes).toHaveLength(1);
      expect(fake.blobs.has(id)).toBe(true);
    }
    images.commitImageReferences(new Set([id]));
    fake.local.raw = JSON.stringify(savedReferences([[], []]));
    await images.deleteUnusedImage(id);
    expect(fake.writes).toHaveLength(1);
    expect(fake.blobs.has(id)).toBe(true);
  });

  it("publishes queued and current receipts separately while collecting only the abandoned upload", async () => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const queued = await upload(images, fake);
    const current = await upload(images, fake);
    const abandoned = await upload(images, fake);
    images.retainImageReferences(new Set([queued, current]));
    await images.deleteUnusedImage(queued);
    await images.deleteUnusedImage(current);
    fake.local.raw = JSON.stringify(savedReferences([[queued]]));
    images.commitImageReferences(new Set([queued]));
    images.retainImageReferences(new Set([current]));
    await images.deleteUnusedImage(queued);
    await images.deleteUnusedImage(current);
    const cleanup = images.deleteUnusedImage(abandoned);
    await flush();
    expect(fake.writes).toHaveLength(4);
    fake.writes[3].commit();
    await cleanup;
    expect([...fake.blobs.keys()]).toEqual([queued, current]);
    fake.local.raw = JSON.stringify(savedReferences([[current]]));
    images.commitImageReferences(new Set([current]));
    images.retainImageReferences(new Set());
    fake.local.raw = JSON.stringify(savedReferences([[]]));
    await images.deleteUnusedImage(queued);
    await images.deleteUnusedImage(current);
    expect(fake.writes).toHaveLength(4);
    expect([...fake.blobs.keys()]).toEqual([queued, current]);
  });

  it.each(["active", "saved", "published"] as const)("preserves %s protection acquired while cleanup waits for a reopened database", async (protection) => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const id = await upload(images, fake);
    fake.connections[0].forceClose();
    fake.control.holdOpen = true;
    const cleanup = images.deleteUnusedImage(id);
    await flush();
    expect(fake.open).toHaveBeenCalledTimes(2);
    expect(fake.writes).toHaveLength(1);
    if (protection === "active") images.retainImageReferences(new Set([id]));
    if (protection === "saved") fake.local.raw = JSON.stringify(savedReferences([[id]]));
    if (protection === "published") images.commitImageReferences(new Set([id]));
    fake.opens[1].onsuccess?.();
    await cleanup;
    expect(fake.writes).toHaveLength(1);
    expect(fake.blobs.has(id)).toBe(true);
  });

  it("reopens after a forced close and retries a failed read without losing the committed blob", async () => {
    const fake = controlledStorage();
    const images = await import("./imageStore");
    const createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fictional-round-four");
    const id = await upload(images, fake);
    images.commitImageReferences(new Set([id]));
    fake.connections[0].forceClose();
    const failed = images.getImageURL(id);
    await flush();
    fake.reads[0].fail("error");
    await expect(failed).resolves.toBeNull();
    expect(createURL).not.toHaveBeenCalled();
    const retried = images.getImageURL(id);
    await flush();
    fake.reads[1].commit();
    await expect(retried).resolves.toBe("blob:fictional-round-four");
    expect(createURL).toHaveBeenCalledExactlyOnceWith(fake.blobs.get(id));
    expect(fake.open).toHaveBeenCalledTimes(2);
    expect(fake.blobs.has(id)).toBe(true);
  });
});
