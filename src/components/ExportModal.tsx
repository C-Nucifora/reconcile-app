import { useEffect, useRef, useState } from "react";
import type { Group } from "../types";
import type { ReportSections } from "../export/report";
import { pdfFilename } from "../export/filename";

const SECTION_LABELS: { key: keyof ReportSections; label: string }[] = [
  { key: "settleUp", label: "Settle-up summary" },
  { key: "expenses", label: "Expense list" },
  { key: "perPerson", label: "Per-person breakdown" },
];

export default function ExportModal({
  group,
  onClose,
}: {
  group: Group;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);
  const mountedRef = useRef(false);
  const closedRef = useRef(false);
  function close() {
    closedRef.current = true;
    onClose();
  }
  useEffect(() => {
    mountedRef.current = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("input, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closedRef.current = true;
        onClose();
      }
      if (event.key === "Tab") {
        const controls = panel?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)");
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (!panel?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [onClose]);
  const [sections, setSections] = useState<ReportSections>({
    settleUp: true,
    expenses: true,
    perPerson: true,
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noneSelected =
    !sections.settleUp && !sections.expenses && !sections.perPerson;

  function toggle(key: keyof ReportSections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleDownload() {
    if (generatingRef.current || noneSelected) return;
    generatingRef.current = true;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    setGenerating(true);
    setError(null);
    try {
      const [{ buildReport }, { ReconcilePdf }, { pdf }] = await Promise.all([
        import("../export/report"),
        import("../export/ReconcilePdf"),
        import("@react-pdf/renderer"),
      ]);
      if (!mountedRef.current || closedRef.current) return;
      const now = new Date();
      const generatedDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      const data = buildReport(group, { sections, generatedDate });
      const blob = await pdf(<ReconcilePdf data={data} />).toBlob();
      if (!mountedRef.current || closedRef.current) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename(group.name, generatedDate);
      try {
        document.body.appendChild(a);
        a.click();
      } finally {
        a.remove();
        // Give the browser time to begin consuming the download.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      close();
    } catch {
      if (mountedRef.current && !closedRef.current) {
        setError("Could not generate the PDF. Please try again.");
      }
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export PDF"
      onClick={close}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-fg">Export PDF</h2>
        <p className="mt-1 text-sm text-muted">
          Choose which sections to include.
        </p>

        <div className="mt-4 space-y-2">
          {SECTION_LABELS.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg"
            >
              <input
                type="checkbox"
                disabled={generating}
                checked={sections[key]}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-negative">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={noneSelected || generating}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
