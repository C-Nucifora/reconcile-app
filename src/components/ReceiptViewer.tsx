import { useEffect, useState } from "react";
import Dialog from "./Dialog";
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
export default function ReceiptViewer({
  imageId,
  onClose,
}: ReceiptViewerProps) {
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

  // A missing image has nothing to show — close out so the caller forgets it.
  useEffect(() => {
    if (status === "missing") onClose();
  }, [status, onClose]);

  if (status === "missing") return null;

  return (
    <Dialog title="Receipt" onClose={onClose} wide>
      <div className="receipt-preview">
        {status === "loading" ? (
          <p className="text-sm text-muted">Loading receipt...</p>
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
    </Dialog>
  );
}
