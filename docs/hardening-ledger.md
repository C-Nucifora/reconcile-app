# Hardening evidence ledger

Baseline is public `main` at `13fece900d952963f0390296d704b86206b70e34`.
The checkout was clean before this task. Preserved interrupted work was inspected
and integrated. No repository AGENTS.md exists. This is a personal project.

No reliable branch last-push timestamp exists in the fresh tracking reflog or
matching public user events. Local commits use a short window within the past
day. No push, deployment, public tunnel, firewall or remote setting change occurred.

## Verification

The untouched baseline passes 70 tests in seven files and builds on Node 22.22.1.
After a clean `npm ci` with npm 11, the final matrix passes:

| Node | Lint | Typecheck | Coverage tests | Build |
| --- | --- | --- | --- | --- |
| 20.20.2 | Pass | Pass | 191 tests, 15 files | Pass |
| 22.22.1 | Pass | Pass | 191 tests, 15 files | Pass |
| 24.22.2 | Pass | Pass | 191 tests, 15 files | Pass |

Commands are `npm run lint`, `npm run typecheck`, `npm run test:coverage --
--maxWorkers=1 --no-file-parallelism` and `npm run build`. Coverage is 69.03%
statements, 68.12% branches, 65.65% functions and 70.63% lines. Browser checks
exercise persistence and event paths beyond the unit coverage. No thresholds or
lint rules were weakened. Two existing Fast Refresh warnings and the lazy PDF
chunk-size warning remain. The final dependency audit reports zero vulnerabilities.

All heavy checks ran serially with
`TMPDIR=/home/christian/.local/share/agent-tmp`. No additional workers were started
under the low-memory instruction. No active temporary files were moved or deleted.
Logs are in that directory's `reconcile-final-checks` folder. Docker was not needed.

## Issue ledger

| ID | Severity | Reproduction and expected behavior | Root cause and fix | Evidence |
| --- | --- | --- | --- | --- |
| MONEY-1 | High | Parse unsafe cents or allocate huge weights. Reject unsupported totals and conserve cents. | Floating point conversion and multiplication lost precision. BigInt decimal parsing and allocation ratios, checked sums and batched exact correction replace unsafe arithmetic and cent-by-cent work. | 1,000 weighted quota cases, 1,500 exact-correction oracle cases, 200 generated ledgers and 1,000 safe-limit parse/format round trips pass. |
| MONEY-2 | Medium | A two-cent legacy exact split with values `[0.1, 1.1]` must allocate `[1, 1]`. | Fraction subtraction made equal decimal remainders compare unequal. Derive fractions from decimal representation. | Failure reproduced before fix. Decimal, scientific-notation, subnormal and removal-tie cases pass. |
| MONEY-3 | High | Give settlement fractional, nonfinite, unsafe or nonzero-sum balances. Reject them without partial transfers. | Rounding and unchecked sums hid invalid balances. Validate each balance and sum with BigInt. | Boundary cases include aggregate credits beyond safe-number range and a one-cent imbalance hidden by floating point. Transfers clear valid balances and remain deterministic. |
| STATE-1 | High | Load corrupt JSON, unsupported versions or damaged records, then edit. Preserve bytes and explain recovery. | Sanitization could silently drop data and overwrite the original. Strict validation now blocks editing, preserves raw data and permits only the supported missing-version migration. | Storage and provider regressions pass. Production corrupt JSON and schema-99 checks preserve supplied bytes and disable editing. |
| STATE-2 | High | Cancel receipt removal or fail/queue a save. Keep photos needed by saved records and drafts. | Immediate blob deletion could precede durable state. Protect current and queued references, clean unpublished drafts, retain published receipts. | Unit cleanup/abort/blocked/retry cases and browser receipt-cancel/quota recovery pass. Published receipt retention is a documented storage cost. |
| STATE-3 | High | Two tabs save from the same snapshot. The stale write must fail. | Compare-and-write alone raced. Web Locks serialize cooperating writers; compare expected bytes and block stale tabs. | Unit serialized-write tests and an actual two-window queued Web Lock race pass. One saves; the other retains its draft and blocks further editing. |
| STATE-4 | Medium | Delete a payer/member, repeat actions or reload exact allocations. Keep valid references and consistent totals. | Missing no-op guards and different deletion/reload repair rules. Guard stale actions and store corrected exact allocations. | Real-reducer deletion cases cover every split mode and orphan items; exact reload shares remain `[30, 70]`. |
| UI-1 | Medium | Switch groups with a draft or remove its payer. Submitted group and payer must match display. | State survived group changes and fallback selection differed from submission. Key workspaces by group and derive the effective payer and current participants. | Component rendering and production group-switch/payer-removal checks pass. |
| UI-2 | Medium | Type negative exact amounts, fractional shares or overflow totals. Keep raw text and prevent saving invalid values. | Early numeric formatting disrupted editing; validation did not match storage. Preserve raw inputs and share validation with clear guidance. | Validation boundaries, keyboard/focus checks and production split workflows pass. |
| UI-3 | Medium | Percentages `0.01`, `64.04`, `35.95` total 100 and must save. | Binary sum yielded `100.00000000000001`. Compare exact decimal values with BigInt. | Failed before fix; final units and browser save pass. A single `99.99999999999999` remains invalid. |
| UI-4 | Medium | Display a long unbroken name at 375-pixel width. Keep controls and amounts within the viewport. | Flex children lacked shrinking width and wrapping. Bound and wrap split, item, balance, settlement and payer labels. | Production scrollWidth fell from 3,342 to 375 pixels across both form modes and summaries. Script-like text stays inert. |
| REVIEW-1 | Medium | Submit a 10,001-character expense description or item name. Preserve the rejected draft and explain. | Reducer rejection was followed by unconditional form reset. Dispatch now reports acceptance; form clears only on acceptance and shares the storage text limit. | Independent finding reproduced before fix, production draft retained after fix, boundary/rendering regressions pass. |
| FILE-1 | Medium | Upload unsupported, empty, oversized or undecodable receipt data. Keep the existing attachment and recover. | Missing bounds and async cleanup. Raster type, byte/pixel checks, JPEG reencoding and guarded draft lifecycle. | Decoder regressions pass; production PNG upload, SVG rejection and corrupt stored-JPEG recovery pass. |
| PDF-1 | Medium | Export Unicode, long names, pending items and multi-page details. Preserve totals and readable rows. | Helvetica lacked glyphs; labels and pending details needed layout. Bundle licensed fonts, bounded amount columns, page numbers, pending explanations and heading spacing. | Actual PDF streams retain every marker across pages; production PDFs were parsed and raster-inspected. |
| PDF-2 | Medium | Dismiss export during rendering or click twice. Prevent a late or duplicate download. | Async continuation ignored closure. Mounted/closed and synchronous generation guards suppress it. | Browser deferred-font cancellation emits no download; duplicate click emits one. Keyboard focus returns to Export PDF. |
| DEPS-1 | Medium | Audit the baseline lock. Remove known tooling vulnerabilities. | Vulnerable Vite, Zod and minimatch resolutions. Update within declared ranges and override minimatch to patched 11.0.8. Add required Node test types. | Clean install, zero-vulnerability audit, reviewed minimatch caller compatibility and complete Node matrix pass. |

Negative expenses and refunds remain unsupported. Zero ordinary expenses cannot
save. Allocated shares plus pending items equal itemized totals; pending items
enter neither payer credit nor debt. Greedy settlement does not guarantee the
fewest transfers, and a counterexample is tested.

## Privacy and private testing

Source review found no data upload, telemetry, remote font or unsafe HTML path.
Production requests were same-origin page assets and bundled fonts. Blob downloads
stay local. The file input accepts receipt images, not restorable data imports.
PDF reports are not backups. No backend or sync system was added.

Temporary production previews used only `127.0.0.1:43189` with strict port selection.
The listener was inspected. Existing nginx routes, public services, tunnels and
containers belong to other work and were preserved. There is no Reconcile proxy
route or container publication. Rootless Docker's existing published ports are
loopback-only. All owned tabs and temporary Reconcile servers were stopped; final
inspection finds no listener on 43189. No secrets or real financial data were used.

## Independent review and remaining limits

An independent Astra high/priority reviewer inspected the combined diff and ran
small source assertions. It found REVIEW-1 and confirmed no other substantive
finding. The owner reproduced, fixed and retested it, then reviewed the final diff.
The reviewer did not run full tests, browser workflows or PDF rendering.

- Previously published receipt blobs remain after deletion to protect other-tab
  drafts. They consume quota; abandoned uploads after a crash can remain too.
- Web Locks protect cooperating modern tabs in secure contexts. Legacy or manual
  writers outside the protocol cannot be coordinated.
- DejaVu covers Latin, Greek and Cyrillic, with incomplete CJK and emoji coverage.
- The image pixel limit runs after decoding and cannot bound initial decoder memory.
- PDF dismissal prevents download but does not interrupt an in-progress render.
- No physical mobile device, real screen reader or universal browser matrix was
  available. Receipt-ID replacement timing remains source-reviewed.

Detailed fictional workflow and PDF evidence is recorded in
[browser-verification.md](browser-verification.md) and
[pdf-verification.md](pdf-verification.md).


## Final existing-finding corrections, 13 November 2026

| Finding | Severity and reproduction | Expected behavior and root cause | Fix and evidence |
| --- | --- | --- | --- |
| R8 theme snapshot | Low. Change OS preference between render and listener registration. | System mode reflects the current OS. The passive subscription did not reread the snapshot. | React external-store subscription. Existing round8-events regression reproduced the failure before correction. |
| R8 corrupt theme startup | Low. Invalid stored choice with dark OS. | Startup and provider agree. Startup treated invalid strings differently. | Startup uses the provider's system default. Existing round8-events regression reproduced the failure. |
| R8 receipt ABA | Low. Resolve A, change to held B, return to A in the same component. Ordinary UI reachability remains unproven. | Never render a revoked URL. ID equality accepted an earlier load's result. | Compare per-load identities in viewer and upload. Two existing round8-viewer regressions reproduced the failure. No blob deletion or data loss was established. |
| PDF heading extractor | Test defect. Paginated heading follows an empty graphics dash array. | Decode the text using its actual font. TJ regex consumed across a closing bracket and swallowed Tf. | Match a single bracket pair. Independent PyMuPDF reads the unchanged PDF heading and first person correctly. Content assertions remain unchanged. |

Earlier no-push statements describe their historical checkpoints. The final
instruction explicitly authorizes normal topic-branch push and a draft PR.
No merge, deployment, protection changes or production changes are authorized.
