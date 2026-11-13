import type { ID } from "../types";
import { newId } from "./id";
import { loadStoredState } from "../state/storage";

// Async IndexedDB wrapper for receipt image blobs. The main app state
// (localStorage) holds only the string ids returned here; the blobs live in a
// separate IndexedDB store so they never bloat localStorage's small quota.
//
// IndexedDB access stays behind this async interface.

const DB_NAME = "reconcile-images";
const STORE_NAME = "images";
const DB_VERSION = 1;
const draftImageIds = new Set<ID>();

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Receipt storage is blocked by another tab. Close older tabs and retry."));
    };
  });
  // If the open fails, allow a later retry rather than caching a rejection.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/**
 * Store an image blob and return a new id referencing it.
 */
export async function putImage(blob: Blob): Promise<ID> {
  const db = await openDB();
  const id = newId();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The receipt could not be stored."));
    tx.onabort = () => reject(tx.error ?? new Error("The receipt write was interrupted."));
  });
  draftImageIds.add(id);
  return id;
}

/**
 * Return an object URL for the stored blob, or null when the id is missing or
 * the read fails. Callers should revoke the URL when done to avoid leaks.
 */
export async function getImageURL(id: ID): Promise<string | null> {
  try {
    const db = await openDB();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error("The receipt read was interrupted."));
    });
    if (!(blob instanceof Blob) || !IMAGE_TYPES.has(blob.type) || blob.size === 0 || blob.size > MAX_FILE_BYTES) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of a stored blob. Never throws.
 */
async function deleteImage(id: ID): Promise<void> {
  try {
    const db = await openDB();
    if (!draftImageIds.has(id) || activeImageIds.has(id)) return;
    const saved = loadStoredState();
    if (saved.error || saved.state.groups.some((group) =>
      group.expenses.some((expense) => expense.receiptImageId === id),
    )) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { draftImageIds.delete(id); resolve(); };
      // Swallow failures: deletion is best-effort cleanup.
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore
  }
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let activeImageIds = new Set<string>();

export function retainImageReferences(ids: Set<string>): void {
  activeImageIds = new Set(ids);
}

// shortcut: published receipts stay stored until cleanup can track other-tab drafts.
export function commitImageReferences(ids: Set<string>): void {
  for (const id of ids) draftImageIds.delete(id);
}

/** Only this tab's unpublished uploads can be safely collected automatically. */
export async function deleteUnusedImage(id: ID): Promise<void> {
  if (!draftImageIds.has(id) || activeImageIds.has(id)) return;
  await deleteImage(id);
}

/**
 * Compress a File to a JPEG Blob, resizing so its longest edge is <= ~1600px,
 * at quality ~0.8. Reject unsupported, oversized or undecodable input so the
 * stored file always contains decoded raster image data.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!IMAGE_TYPES.has(file.type) || file.size === 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("Choose a JPEG, PNG or WebP photo up to 10 MB.");
  }
  const bitmap = await loadBitmap(file);
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error("The photo dimensions are too large.");
    }
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The photo could not be processed.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) throw new Error("The photo could not be processed.");
    return blob;
  } finally {
    closeBitmap(bitmap);
  }
}

function scaledSize(
  srcW: number,
  srcH: number,
): { width: number; height: number } {
  const longest = Math.max(srcW, srcH);
  if (longest <= MAX_EDGE || longest === 0) {
    return { width: srcW, height: srcH };
  }
  const scale = MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

type DrawSource = ImageBitmap | HTMLImageElement;

async function loadBitmap(file: File): Promise<DrawSource> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Fallback for environments without createImageBitmap.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeBitmap(source: DrawSource): void {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}
