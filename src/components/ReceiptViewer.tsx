import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ID } from "../types";
import { getImageURL } from "../lib/imageStore";

interface ReceiptViewerProps {
  imageId: ID;
  onClose: () => void;
}

/**
 * A simple lightbox that loads a receipt image blob by id and shows it centered
 * over a dimmed backdrop. The object URL is revoked on close/unmount so we never
 * leak. If the image is missing (or the load fails) the modal closes itself and
 * renders nothing.
 */
export default function ReceiptViewer({ imageId, onClose }: ReceiptViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    getImageURL(imageId).then((result) => {
      if (!active) {
        // Component unmounted before the load resolved; revoke immediately.
        if (result) URL.revokeObjectURL(result);
        return;
      }
      if (result) {
        createdUrl = result;
        setUrl(result);
        setStatus("ready");
      } else {
        setStatus("missing");
      }
    });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [imageId]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A missing image has nothing to show — close out so the caller forgets it.
  useEffect(() => {
    if (status === "missing") onClose();
  }, [status, onClose]);

  if (status === "missing") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close receipt"
        onClick={onClose}
        className="absolute inset-0 bg-fg/60 motion-safe:transition-opacity"
      />

      {/* Panel */}
      <div className="relative z-10 flex max-h-[90vh] max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Receipt
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-32 items-center justify-center overflow-auto bg-surface-2 p-4">
          {status === "loading" ? (
            <p className="text-sm text-muted">Loading receipt…</p>
          ) : (
            url && (
              <img
                src={url}
                alt="Receipt"
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
              />
            )
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
