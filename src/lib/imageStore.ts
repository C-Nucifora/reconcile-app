import type { ID } from "../types";
import { newId } from "./id";

// Async IndexedDB wrapper for receipt image blobs. The main app state
// (localStorage) holds only the string ids returned here; the blobs live in a
// separate IndexedDB store so they never bloat localStorage's small quota.
//
// This module is browser-only (IndexedDB is not available in the node test
// environment) and is therefore kept isolated behind its async interface and
// excluded from unit tests.

const DB_NAME = "reconcile-images";
const STORE_NAME = "images";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
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
    });
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of a stored blob. Never throws.
 */
export async function deleteImage(id: ID): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
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

/**
 * Compress a File to a JPEG Blob, resizing so its longest edge is <= ~1600px,
 * at quality ~0.8. Drawing happens on a canvas; if anything fails the original
 * file (a Blob) is returned so the caller can still attempt to store it.
 */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = scaledSize(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      closeBitmap(bitmap);
      return file;
    }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    closeBitmap(bitmap);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    return blob ?? file;
  } catch {
    return file;
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
