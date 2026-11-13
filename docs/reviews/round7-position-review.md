# Round 7 position review

The inline-name failure is a confirmed fixture defect, and root's concatenation correction is appropriate. The other two failures remain unresolved position alarms. I found no source-confirmed production defect that justifies changing the 110-point monetary column. This is not a clean round or publication clearance.

Reviewed the current checkout and frozen fixture on 12 November 2026. Only this external report was written. No source or test edits, runtime probes, renderer or browser jobs, installs, commits, pushes, nested agents or job polling were performed. The local tracking reflog records the relevant branch's last push at `2026-11-12 09:33:41 +1000`, commit `997a8a8`.

## Evidence and scope

Read `docs/audit-rounds.md`, the external `round7-pdf-review.md` and `integrated-rounds2-6-review.md`, `resumed-gates/integration-round7.log`, and `resumed-gates/integration-results.json`. The JSON records lint exit 0, typecheck exit 0 and round 7 exit 1. The focused log reports 28 passes and three failures, consistent with 27 decoder passes, one parser-calibration pass and three actual-PDF failures. Full coverage and build did not run in that batch.

Also read the current and frozen round 7 PDF fixture, `ReconcilePdf.tsx`, `report.ts`, `personLabels.ts`, and the installed react-pdf text/glyph writer and PDFKit font/transform implementation. The frozen-to-current fixture comparison shows only the external PDF-writing instrumentation and root's `normalizedText` separator correction. I did not change or rerun either fixture.

At the evidence-directory inspection, `round7-pdf-position-proof` contained the frozen source/configuration and dependency symlink, but no `render-*.pdf` or `independent-positions.json`. I read the prepared independent extraction script, not its results. I did not poll or execute its queued job. There is therefore no independently measured glyph placement or raster evidence in this review.

## Confirmed fixture defect, low severity

Trigger: render the canonical-name fixture with distinct people named composed Élodie, decomposed Élodie and literal Élodie (1). The emitted text objects include `Élodie (3)`, ` pays ` and `Élodie (2)` separately. Joining them with newlines makes the expected literal `Élodie (3) pays Élodie (2)` absent even though all three fragments are present.

Expected behavior: the literal-content view preserves adjacent inline fragments, while the monetary view retains text-object boundaries for exact occurrence checks.

Cause and minimal remedy: [round7-layout.audit.test.tsx:163](/home/christian/Documents/dev/reconcile-app/src/export/round7-layout.audit.test.tsx:163) formerly used `join("\n")`. Root changed it to `join("")`. The monetary extractor still examines each object separately; the two standalone occurrences of each identity, all expected amounts, input immutability and layout assertions remain. This corrects the demonstrated cause without weakening those checks. A successful rerun is still required. The original NFC test stopped at its first literal assertion, before its later identity, layout and immutability assertions.

The report label source also supports the expected suffixes. `personLabels` reserves all NFC comparison keys before allocating suffixes, so the literal suffix 1 reserves that name and the duplicate family receives suffixes 2 and 3. Report construction continues looking up parties and assignees by ID and does not modify stored names. Nothing in this failure establishes a regression in that production fix.

## Position parser challenge

The following source checks support the parser's main calculation, but do not independently validate the failed PDFs:

- Installed [render/lib/index.js:85](/home/christian/Documents/dev/reconcile-app/node_modules/@react-pdf/render/lib/index.js:85) encodes embedded glyphs using subset CIDs and records each CID's width as `glyph.advanceWidth * font.scale`. PDFKit sets that scale to `1000 / unitsPerEm` and emits `/W [0 [widths...]]`. The fixture indexes that same CID array and multiplies by `fontSize / 1000`. I found no extra units-per-em conversion or glyph-ID/CID substitution in this path.
- Installed [render/lib/index.js:137](/home/christian/Documents/dev/reconcile-app/node_modules/@react-pdf/render/lib/index.js:137) emits the negative of `xAdvance - advanceWidth` after a glyph segment. The fixture subtracts TJ numbers times `fontSize / 1000`, which has the correct sign. It carries the cursor across TJ arrays and resets it at each Tm, as the writer's offset handling requires. Advance endpoints are recorded before a following adjustment, so these are bounds on glyph advance cells, not merely the final cursor or measured ink outlines.
- PDFKit's `transform` implementation uses the same matrix composition as the fixture's `multiply(ctm, value)`. Combining CTM with Tm, followed by converting page-space Y to top-origin Y, agrees with the writer's coordinate flip. The parser rejects a non-unit or rotated effective transform at TJ. The supplied calibration checks translation, the Y flip, negative TJ spacing and CTM restoration, but uses synthetic widths and cannot certify the real font or PDF output.
- The xref slicing, declared stream lengths, one-level page-tree order and explicit Type0 font resources match the writer-specific format this fixture intends to support. The earlier compressed-length and exact-amount-boundary objections are not reopened by this review. These assumptions do not make the helper a general PDF reader.

One concrete parser limitation remains at [round7-layout.audit.test.tsx:68](/home/christian/Documents/dev/reconcile-app/src/export/round7-layout.audit.test.tsx:68). Its q/Q stack saves only CTM, although PDF graphics state also saves the selected text font and size. A synthetic sequence that selects F1 at 10 points, saves state, selects F2 at 20 points, restores state, then emits text without another Tf would be measured using F2 at 20 points. Expected behavior is F1 at 10 points. Saving/restoring font and size along with CTM is the minimal correction if that sequence is supported; alternatively, explicitly reject reliance on inherited font state in this narrow extractor. This is a low-severity fixture limitation, not an explanation for the observed failures: the installed `_renderGlyphs` emits Tf for every BT/TJ run. Do not change production in response to it.

The position representation also retains only one baseline and size for a whole BT/ET object. That is adequate only when the emitted object's glyphs share the baseline assumed by the overlap assertion. Multiple offset Tm operations deserve an explicit calibration before broader claims about marks or vertical collisions. Neither this caveat nor font-state restoration demonstrates that the current maximum-cent alarms are false.

## Unresolved maximum-cent alarms

The first failing render uses an exact split at `Number.MAX_SAFE_INTEGER` with long creditor, debtor and expense labels. Its exact amount counts pass before the layout assertion reports 15 violations. For example, the parser reports the first regular amount at x `468.386902..578.26385517` and its neighboring label at x `36..550.45874018`, on the same baseline. Those are parser measurements, not an independently confirmed overlap.

The third render uses an assigned item of maximum cents minus one, one pending cent, and long description/item paragraphs. Ordered full-text, marker, amount and action-field assertions pass before the layout assertion reports four violations. The description amount is reported at x `460.061981..580.6860044`, with its label ending at `494.14453136`; the item amount is reported at x `468.643738..578.52069117`, with its label ending at `546.51074235`. Footer assertions follow the failure and have not been cleared by this run.

Expected behavior is complete amounts and labels within the existing page bounds, without overlap. Their product severity and source cause remain unassigned pending independent placement evidence. The current production style really does reserve a fixed 110-point amount column, prevents its shrinkage, and gives the flexible label 12 points of right padding. That source declaration alone proves neither that the amounts fit nor that the reported positions are correct.

Root's next comparison should use the already queued artifacts. For each failing amount and its adjacent label, compare page, font, font size, origin and endpoint against the independent spans. Reconcile any difference using the actual font-resource mapping, CID widths, TJ adjustments and composed cm/Tm transforms from that same PDF. Check both regular and bold amounts, the negative amount, and the wrapped `net` heading. The prepared JSON includes full page text plus maximum-cent spans and outside-bound spans; zero outside spans alone would not establish absence of interior label overlap. Neighboring-label placement still needs comparison from the PDF or independent text geometry.

If the independent geometry agrees with the reported bounds, identify the actual layout or font-measurement cause before choosing a minimal production correction. If it disagrees, correct the demonstrated parser error and add a calibration derived from that emitted sequence. In either case, retain all existing monetary counts, full ordered content, identity occurrences and page/overlap bounds. Do not enlarge tolerances, remove assertions or widen the production column solely to make this parser pass.

Publication, completed full coverage/build, supported-Node checks, native follow-up and two consecutive completed clean rounds remain pending. This review adds source reasoning and one confirmed fixture diagnosis; it does not supply the missing runtime clearance.
