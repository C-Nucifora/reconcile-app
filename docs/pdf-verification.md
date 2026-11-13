# PDF and receipt verification

Verified changes against `13fece900d952963f0390296d704b86206b70e34`.
All fixtures are fictional. The owner integrated the scoped implementation and
review results, then ran the serialized checks and production browser tests below.

## Findings and fixes

| Severity | Reproduction | Expected behavior | Root cause | Fix and evidence |
| --- | --- | --- | --- | --- |
| High, preserved fix reviewed | Edit an expense with a saved receipt, remove its photo, then cancel. | Cancelling keeps the original receipt. | The baseline uploader deleted the blob immediately, before the expense change was saved. | The preserved uploader defers deletion to `deleteUnusedImage` and tracks only newly created drafts. The current storage implementation checks live and durable references. Source review confirms removal only calls `onChange(undefined)`. Production cancellation preserves the saved reference and blob; durable cleanup and queued-reference regressions pass. |
| Medium, fixed | Start PDF generation, then press Cancel, Escape, or dismiss the backdrop before rendering resolves. | Dismissal prevents a later download. | The asynchronous handler continued after the modal closed. | Mounted and closed guards stop work after imports and before creating the download URL. Duplicate clicks also use the preserved synchronous generation guard. Production browser cancellation and keyboard checks pass. |
| Medium, fixed | Open receipt A, then change the component's receipt ID while B is still loading. | A must disappear immediately. | The URL state was independent of the requested receipt ID. | Viewer and thumbnail state now carry their image ID. A mismatched URL is never rendered. Both effects revoke resolved URLs on replacement, unmount, and late resolution. Source review completed. Browser cancellation and corrupt-image recovery pass; receipt-ID replacement timing remains source-reviewed. |
| Medium, fixed | Load a stored blob whose bytes cannot decode as an image. | No broken lightbox or unusable attachment controls. | Successful blob lookup was treated as successful image decoding. | Image `onError` handlers close the viewer or show an unavailable thumbnail. An unavailable attached photo can still be removed from the form. |
| Medium, preserved fix strengthened | Export a long name, a long itemised expense, or Latin, Greek, and Cyrillic names. | Amounts stay in their column, details paginate, and supported names retain their characters. | Baseline Helvetica lacked the required Unicode glyphs; labels had no shrinking width or long-word breaks. | Bundled DejaVu regular/bold, bounded amount columns, Unicode codepoint word splitting, and fixed page numbers are preserved. The regression now reads actual page text and checks every marker exactly once. The final serialized suite passes on all supported Node versions. |
| Medium, preserved fix reviewed | Export an itemised $10.00 expense with $4.00 still unassigned. | Show the full expense and explain why only $6.00 enters balances. | The baseline report omitted a pending amount explanation. | `pendingCents` is included and rendered as excluded from balances. Report tests check the $4.00 difference and fully pending expenses. |
| Low, fixed | Use path separators, control characters, direction overrides, or a long Unicode group name in a filename. | A safe bounded filename that preserves complete Unicode codepoints. | The preserved sanitizer triggered `no-control-regex` and sliced UTF-16 code units. | `pdfFilename` checks control character codes, replaces forbidden filename characters, and limits by codepoint. No lint rules were disabled. Focused filename tests cover these cases. |
| Low, fixed | Redistribute the app or a PDF with embedded font subsets. | Font permission and attribution notices accompany the font copies. | The preserved font license was untracked and not included in generated output. | Keep `src/export/fonts/LICENSE`, import it into the export bundle, and include it in PDF subject metadata. Removed only the unrelated Debian packaging license stanza. |

## PDF evidence and coverage

The report fixture has Ann paying $20.00 and owing $16.00, giving a $4.00 net
balance. Bob receives only $6.00 credit for a $10.00 itemised expense because
$4.00 is pending. Bob owes Ann $4.00.

`src/export/report.test.ts` checks all eight section combinations, all four split
modes with a 101-cent rounding case, pending items, an empty group, input
immutability, and omission of receipt identifiers.

`src/export/ReconcilePdf.test.tsx` decodes the generated PDF's page streams and
ToUnicode maps. It handles multiple text runs and ligature mappings. It asserts
literal `Élodie Ω Ж <script>alert("fictional")</script>` text, money and pending
details, and absence of PDF JavaScript, URI actions, embedded files, and images.
The pagination fixture has 30 expenses and 123 item rows. Its last expense has
65 items, which must span pages. Every expense and item marker must occur once,
and every page must contain its page number and total page count.

Receipt images remain omitted from PDFs, as required by the existing design.
Names and descriptions enter React PDF `Text` nodes. They are never interpreted
as HTML, links, SVG, or PDF instructions. The export does not read receipt blobs
or send reconciliation data to a service. Fonts resolve from local bundled assets.

## Receipt boundary evidence

`src/components/receipt.test.ts` exercises the existing storage decoder without
changing it or opening IndexedDB. Mocked platform APIs verify rejection of empty,
unsupported, oversized, corrupt, and excessive-dimension input; JPEG reencoding
of JPEG, PNG, and WebP; a 1600-pixel longest edge; white background compositing;
bitmap release after success and processing errors; and revocation of fallback
decode URLs after success and failure. Oversized-file fixtures override the size
property rather than allocate a large buffer.

The reviewed storage implementation accepts JPEG, PNG, and WebP up to
10,485,760 bytes and rejects decoded images over 40,000,000 pixels. Canvas
reencoding stores pixel output rather than the original file and its metadata.
Components render only blob URLs in `img` elements, with fixed alt text.

## Font licensing

The bundled font bytes match the installed DejaVu files at
`/usr/share/fonts/truetype/dejavu/`.

| File | SHA-256 |
| --- | --- |
| `DejaVuSans.ttf` | `b4c632e3cdf9acc7f28758fb5a323c8524d7fc6660d46904d9b6cbe2809c419c` |
| `DejaVuSans-Bold.ttf` | `e1d733afbbfce842a1b43dced0c9885a76a4e67290dc7e690c4e9b76ebfc7d23` |

`fc-scan` identifies the files as DejaVu Sans Book and Bold. The retained Bitstream
Vera permission allows use, copying, modification, and redistribution with its
copyright, trademark, and permission notices. DejaVu changes are public domain.
The fonts were not modified or renamed in this work. The GPL stanza in the
original Debian copyright file applied to `debian/*` packaging, not these TTFs.
The generated PDF carries the retained font notice in its subject metadata.

## Verification status

Final lint, typecheck, 191 tests with coverage, and production builds pass on Node
20.20.2, 22.22.1 and 24.22.2 after a clean npm install. The tests include actual
PDF stream decoding, page-number checks and complete marker counts across pages.
The final layout places section headings beside their bodies so pagination hints
can keep them together. The exact production fixture failed before this change
and passes afterward. Lint retains
two existing Fast Refresh warnings; build retains the lazy PDF chunk-size warning.

Production browser checks cover duplicate download prevention, section selection,
keyboard focus and traps, cancellation while font requests are deferred, receipt
edit cancellation, raster upload and SVG rejection, and corrupt stored-image
recovery. Downloaded reports were parsed with PyMuPDF and rasterized for visual
inspection. The local date, totals, pending amounts, literal script-like text,
long names and page numbers were checked. See browser-verification.md for exact
fixtures and limits. Receipt-ID replacement and all late-resolution permutations
were source-reviewed, not exhaustively browser-tested.

No final verification server or browser session remains running. No remote writes
or deployment occurred.

## Remaining limits

- DejaVu has broad Latin, Greek, and Cyrillic coverage. Universal Unicode,
  including CJK and all emoji, is not supported by this font pair. Such names can
  produce missing glyphs. No claim of universal Unicode preservation is made.
- The 40-million-pixel check runs after browser decoding. It bounds canvas
  allocation but cannot prevent the decoder's initial memory allocation. Storage
  owns that boundary and was left unchanged.
- Dismissal suppresses a completed PDF download but does not interrupt rendering
  already running inside React PDF.
- No reliable last-push timestamp was available in the local remote-tracking
  reflog. Verified changes are committed locally using the past-day fallback.
