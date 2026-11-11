import { useEffect, useRef, useState } from "react";
import type { ID } from "../types";
import {
  compressImage,
  deleteUnusedImage,
  getImageURL,
  putImage,
} from "../lib/imageStore";

interface ReceiptUploadProps {
  imageId?: ID;
  onChange: (id?: ID) => void;
}

/**
 * Attach a single receipt photo to an expense. The chosen file is compressed
 * to a JPEG blob and stored in IndexedDB via imageStore; only the returned id
 * lives on the expense (and thus in localStorage). A thumbnail is shown with
 * view (larger lightbox) and remove actions. Failures (quota, decode, missing
 * blob) degrade gracefully: the expense can still be saved without a photo.
 */
export default function ReceiptUpload({ imageId, onChange }: ReceiptUploadProps) {
  const mountedRef = useRef(false);
  const selectingRef = useRef(false);
  const draftImagesRef = useRef(new Set<ID>());
  useEffect(() => {
    mountedRef.current = true;
    const drafts = draftImagesRef.current;
    return () => {
      mountedRef.current = false;
      for (const id of drafts) void deleteUnusedImage(id);
    };
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [thumbnail, setThumbnail] = useState<{ imageId?: ID; url: string | null } | null>(null);
  const thumbUrl = thumbnail?.imageId === imageId ? thumbnail?.url : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Resolve an object URL for the current image id and revoke it on change /
  // unmount so blobs are not leaked. State is only updated inside the async
  // callback (never synchronously in the effect body); if the image is gone the
  // lightbox is closed there too.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    Promise.resolve(imageId ? getImageURL(imageId) : null).then((resolved) => {
      if (cancelled) {
        if (resolved) URL.revokeObjectURL(resolved);
        return;
      }
      url = resolved;
      setThumbnail({ imageId, url: resolved });
      if (!resolved) setLightboxOpen(false);
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageId]);

  // Close the lightbox on Escape for keyboard users (parity with ReceiptViewer),
  // and move focus to the close button on open so keyboard users land inside it.
  useEffect(() => {
    if (!lightboxOpen || !thumbUrl) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); setLightboxOpen(false); }
      if (e.key === "Tab") { e.preventDefault(); closeButtonRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [lightboxOpen, thumbUrl]);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later.
    e.target.value = "";
    if (!file || selectingRef.current) return;
    selectingRef.current = true;

    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      if (!mountedRef.current) return;
      const id = await putImage(blob);
      if (!mountedRef.current) { void deleteUnusedImage(id); return; }
      draftImagesRef.current.add(id);
      onChange(id);
    } catch {
      if (mountedRef.current) setError("Couldn't add the photo. Use a JPEG, PNG or WebP up to 10 MB and check available browser storage. You can save without a photo.");
    } finally {
      selectingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  function handleRemove() {
    setError(null);
    setLightboxOpen(false);
    onChange(undefined);
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted">
        Receipt photo
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleSelect}
        className="hidden"
      />

      {imageId ? (
        <div className="flex items-center gap-3">
          {thumbUrl ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="View receipt photo"
            >
              <img
                src={thumbUrl}
                alt="Receipt thumbnail"
                onError={() => {
                  setThumbnail({ imageId, url: null });
                  setLightboxOpen(false);
                }}
                className="h-16 w-16 object-cover"
              />
            </button>
          ) : (
            <p className="text-xs text-muted">
              {thumbnail?.imageId === imageId ? "Receipt unavailable." : "Loading receipt…"}
            </p>
          )}
          <div className="flex flex-col items-start gap-1">
            {thumbUrl && (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="text-sm font-medium text-accent hover:opacity-80"
              >
                View
              </button>
            )}
            <button
              type="button"
              onClick={handleRemove}
              className="text-sm font-medium text-negative hover:opacity-80"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              d="M3 7.5A1.5 1.5 0 0 1 4.5 6h1.2l.7-1.2A1 1 0 0 1 7.3 4.3h5.4a1 1 0 0 1 .9.5L14.3 6h1.2A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-7Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle
              cx="10"
              cy="10.5"
              r="2.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          {busy ? "Adding photo…" : "Add photo"}
        </button>
      )}

      {error && <p role="alert" className="text-xs text-warning">{error}</p>}

      {lightboxOpen && thumbUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Receipt photo"
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-fg/60 p-4"
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={thumbUrl}
              alt="Receipt"
              onError={() => {
                setThumbnail({ imageId, url: null });
                setLightboxOpen(false);
              }}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-sm"
            />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
              className="absolute -right-3 -top-3 rounded-full bg-surface p-1.5 text-fg shadow-sm transition hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
