import { describe, expect, it } from "vitest";
import { pdfFilename } from "./filename";

describe("PDF filenames", () => {
  it("replaces path separators, controls and direction overrides", () => {
    expect(pdfFilename('../Trip\\:<>"|?*\u0000\n\u007f\u0085\u202e', "2026-11-12"))
      .toBe('Reconcile - .._Trip_____________ - 2026-11-12.pdf');
  });

  it("preserves Unicode codepoints when limiting a long name", () => {
    expect(pdfFilename("ÉΩЖ" + "😀".repeat(110), "2026-11-12"))
      .toBe(`Reconcile - ÉΩЖ${"😀".repeat(97)} - 2026-11-12.pdf`);
    expect(pdfFilename("   ", "2026-11-12"))
      .toBe("Reconcile - Group - 2026-11-12.pdf");
  });
});
