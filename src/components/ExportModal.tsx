import { useState } from "react";
import Dialog from "./Dialog";
import type { Group } from "../types";
import type { ReportSections } from "../export/report";

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
    setGenerating(true);
    setError(null);
    try {
      const [{ buildReport }, { ReconcilePdf }, { pdf }] = await Promise.all([
        import("../export/report"),
        import("../export/ReconcilePdf"),
        import("@react-pdf/renderer"),
      ]);
      const generatedDate = new Date().toISOString().slice(0, 10);
      const data = buildReport(group, { sections, generatedDate });
      const blob = await pdf(<ReconcilePdf data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reconcile - ${group.name} - ${generatedDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Could not generate the PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog title="Export PDF" onClose={onClose}>
      <div className="export-content">
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
                checked={sections[key]}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
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
    </Dialog>
  );
}
