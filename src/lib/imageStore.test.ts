import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Model transaction completion separately from request success and aborts.
function fakeStorage() {
  const blobs = new Map<string, unknown>();
  const failures = { open: false, blocked: false, write: false, read: false };
  const deletion = vi.fn();
  const requests: Array<{ onsuccess: (() => void) | null }> = [];
  const db = {
    close: vi.fn(), onversionchange: null as (() => void) | null, onclose: null as (() => void) | null,
    objectStoreNames: { contains: () => true },
    transaction: vi.fn(() => {
      const tx = {
        error: new Error("Fictional transaction failure"),
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          put: (blob: Blob, id: string) => queueMicrotask(() => {
            if (failures.write) { tx.onabort?.(); return; }
            blobs.set(id, blob);
            tx.oncomplete?.();
          }),
          delete: (id: string) => {
            deletion(id);
            queueMicrotask(() => {
              if (failures.write) { tx.onabort?.(); return; }
              blobs.delete(id);
              tx.oncomplete?.();
            });
          },
          get: (id: string) => {
            const req = { result: blobs.get(id), onsuccess: null as (() => void) | null };
            queueMicrotask(() => failures.read ? tx.onabort?.() : req.onsuccess?.());
            return req;
          },
        }),
      };
      return tx;
    }),
  };
  const open = vi.fn(() => {
    const req = {
      result: db, error: new Error("Fictional denied database"),
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onblocked: null as (() => void) | null,
    };
    requests.push(req);
    queueMicrotask(() => failures.open ? req.onerror?.() : failures.blocked ? req.onblocked?.() : req.onsuccess?.());
    return req;
  });
  vi.stubGlobal("indexedDB", { open });
  const local = { raw: null as string | null };
  vi.stubGlobal("localStorage", { getItem: () => local.raw });
  return { blobs, failures, db, open, deletion, requests, local };
}

const photo = () => new Blob(["fictional photo bytes"], { type: "image/jpeg" });
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("receipt durability", () => {
  it("only returns an image id after a completed transaction", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    fake.failures.write = true;
    await expect(images.putImage(photo())).rejects.toThrow(/transaction/);
    expect(fake.blobs.size).toBe(0);
    fake.failures.write = false;
    const id = await images.putImage(photo());
    expect(fake.blobs.get(id)).toBeInstanceOf(Blob);
  });
  it("allows a retry after denied or blocked database opens", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    fake.failures.open = true;
    await expect(images.putImage(photo())).rejects.toThrow(/denied/);
    fake.failures.open = false;
    fake.failures.blocked = true;
    await expect(images.putImage(photo())).rejects.toThrow(/blocked/);
    fake.requests[1].onsuccess?.();
    expect(fake.db.close).toHaveBeenCalledTimes(1);
    fake.failures.blocked = false;
    await images.putImage(photo());
    expect(fake.open).toHaveBeenCalledTimes(3);
    fake.db.onversionchange?.();
    await images.putImage(photo());
    expect(fake.open).toHaveBeenCalledTimes(4);
  });
  it("deletes this tab's unused uploads but protects unsaved and queued references", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    const id = await images.putImage(photo());
    images.retainImageReferences(new Set([id]));
    await images.deleteUnusedImage(id);
    expect(fake.blobs.has(id)).toBe(true);
    images.retainImageReferences(new Set());
    await images.deleteUnusedImage(id);
    expect(fake.blobs.has(id)).toBe(false);
  });
  it("rechecks references after opening the database before deleting", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    const id = await images.putImage(photo());
    const cleanup = images.deleteUnusedImage(id);
    images.retainImageReferences(new Set([id]));
    await cleanup;
    expect(fake.deletion).not.toHaveBeenCalled();
  });
  it("preserves receipts while saved state is corrupt or storage reads are denied", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    const id = await images.putImage(photo());
    fake.local.raw = "{broken";
    await images.deleteUnusedImage(id);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); } });
    await images.deleteUnusedImage(id);
    expect(fake.deletion).not.toHaveBeenCalled();
  });
  it("keeps durable receipts for other tabs' open drafts after expense deletion", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    const id = await images.putImage(photo());
    images.commitImageReferences(new Set([id]));
    images.retainImageReferences(new Set());
    await images.deleteUnusedImage(id);
    expect(fake.blobs.has(id)).toBe(true);
    expect(fake.deletion).not.toHaveBeenCalled();
  });
  it("cannot collect another tab's unpublished upload", async () => {
    const fake = fakeStorage();
    const firstTab = await import("./imageStore");
    const id = await firstTab.putImage(photo());
    vi.resetModules();
    const secondTab = await import("./imageStore");
    await secondTab.deleteUnusedImage(id);
    expect(fake.deletion).not.toHaveBeenCalled();
    await firstTab.deleteUnusedImage(id);
    expect(fake.blobs.has(id)).toBe(false);
  });
  it("settles failed reads and refuses non-image stored values", async () => {
    const fake = fakeStorage();
    const images = await import("./imageStore");
    const id = await images.putImage(photo());
    fake.failures.read = true;
    await expect(images.getImageURL(id)).resolves.toBeNull();
    fake.failures.read = false;
    fake.blobs.set(id, "corrupt blob");
    await expect(images.getImageURL(id)).resolves.toBeNull();
    fake.blobs.set(id, new Blob(["<svg/>"], { type: "image/svg+xml" }));
    await expect(images.getImageURL(id)).resolves.toBeNull();
  });
});
