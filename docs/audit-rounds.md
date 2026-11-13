# Extended audit rounds

The extension starts from `cf14885`, following the original hardening pass.
The user requested at least three new rounds and then two consecutive clean
independent rounds. A checkpoint was published as 997a8a8, and the user explicitly
resumed work afterward. Those extended requirements remain open. Rounds 2 through
6 have source-reviewed fixes and a live coverage log reporting 1,175 passing
tests. Its wrapper timed out before capturing process exit or running build;
separate completion checks are pending. Round 7 now targets actual PDF layout
at monetary limits and receipt decode fallback/failure recovery. Its 27 decoder
probes passed. Two PDF position alarms await independent geometry; inline-text
extraction and inherited-font fixture issues have source fixes awaiting rerun.
Publication, updated supported-Node checks, native follow-up and two consecutive completed
clean rounds remain pending. The sections below retain their earlier evidence
and explicitly record subsequent corrections.

## Acceptance matrix

| Area | Invariants and sequences |
| --- | --- |
| Arithmetic | Safe integer cents; equal, exact, percentage, shares and items; deterministic remainders; conservation; deletion/reload; settlement clears balances without a minimum-transfer claim. |
| Persistence | Bounded validation/migrations; corruption, quota, denied and interrupted operations; queued saves/retry; stale snapshots and cross-tab changes; preserve original bytes on failure. |
| Receipts | Upload/replacement/cancellation/unmount; failed writes; reference protection; unpublished cleanup; missing/corrupt blobs; bounded raster input. |
| Interface | Group/member changes during drafts; duplicate/no-op/rejected actions; editable numeric text; dates/text bounds; keyboard/mobile behavior; recovery guidance. |
| Reports/privacy | Selected sections and totals; pending items; long/untrusted/Unicode text; pagination; local fonts; cancelled/failed exports; no upload or restorable-backup claim. |
| Environment | Supported Node checks; dependency audit; production-browser checks; loopback-only services; rootless Docker if needed; fictional fixtures; owned-service cleanup. |

A completed round needs new independent breaking, reproducible triage, separate
fixes where needed, focused/full checks, fresh independent challenge and a
published coherent batch. Existing tests alone do not complete a new round.
No new round is complete at this checkpoint.

## Ownership, resources and publication

Repository: `/home/christian/Documents/dev/reconcile-app`.
Branch: `hardening/audit-cycles-20261112`.
Origin: `https://github.com/C-Nucifora/reconcile-app.git`.
No repository AGENTS.md was found. This is a personal project.

Two breakers, then two separate fixers, then one fresh reviewer worked with
non-overlapping file ownership. T3 could not prepare a Reconcile worktree from
this thread's project, so shared checkout ownership was used. All workers have
finished. Production edits are limited to six files; root owns the two new
regression files and this ledger. No unrelated user changes were identified.

All tests/builds use `TMPDIR=/home/christian/.local/share/agent-tmp`, one test
worker and `/home/christian/.local/state/agent-swarms/heavy.lock`. Early 45-second
acquisitions expired before execution. Later jobs use a single queued acquisition
with a 900-second maximum wait and a 60-second execution cap. Separate checkpoint
suites release the lock between runs. No lock bypass, public service, tunnel or
container was started. Other owners were notified of resource use and contention.

The user explicitly authorized ordinary topic pushes. Main, force pushes,
merges, releases and deployments remain outside authorization. Before publication,
origin was fetched and triggers inspected. The only workflow runs push CI on main
and PR CI targeting main. Hooks and deployments were empty; Pages was disabled.
Topic pushes do not trigger that workflow. No PR was opened.

The four original signed commits were verified and published unchanged through
`cf14885`. Retained logs show 191 tests in 15 files, lint, typecheck and build
passing on Node 20.20.2, 22.22.1 and 24.22.2. A fresh baseline archive lint passed;
its attempted typecheck reruns did not acquire the lock. Original verification
supports the original batch, not completion of the new rounds.

The branch's first push is recorded in the tracking reflog at
2026-11-12 08:59:25 +1000. The checkpoint uses configured SSH signing and short,
lowercase commit messages. Published history will not be rewritten.

## Round 1

Status: verified checkpoint; full Node 22 gates pass; native follow-up deferred.

Hypotheses targeted gaps in live provider queues/retries, external writes while
locks are pending, receipt processing across submit/cancel/group switches, and
rejected/no-op actions. Breakers used actual React hooks/effects with an installed
reconciler and synthetic host nodes. Storage, Web Locks and image operations were
controlled fault boundaries. These fixtures do not establish native focus, blur,
event bubbling, IndexedDB decoding or development StrictMode effect replay.

### Reproductions and fixes

| ID | Severity | Reproduction and expected behavior | Confirmed cause and fix |
| --- | --- | --- | --- |
| R1-RECEIPT | Medium | Fill an expense, select a photo and submit during compression/write. Wait for the selected receipt. | Both stages accepted the expense without receiptImageId and reset the form. Child busy state was private. ReceiptUpload now reports busy synchronously; ExpenseForm uses refs to guard captured handlers, disables submit and shows guidance. |
| R1-NAME | Medium | Add/rename a group/member with 10,001 characters, then make a valid edit. Reject the unsupported name and retain the draft. | Name actions bypassed bounds, cleared person input and poisoned later saves. Reducer now checks deterministic bounds before accepting state. Person drafts survive rejection; group prompts retain text for a prefilled retry. |
| R1-SIZE | Low | Add an individually valid expense to 83 escaped descriptions near 5,000,000 serialized characters. Reject the oversized combined state. | Reducer checked expense validity and aggregate cents but omitted whole-record size. A shared bound check now runs before replacing state. Save already preserved bytes on refusal. |
| R1-CANONICAL | Low | Load compact numeric JSON below the bound whose canonical form exceeds it. Identify the unsupported representation before editing. | Load checked incoming size while save checked canonical size. Validation now checks canonical size too; failed load retains original bytes. Save serializes its candidate once. |
| R1-NOOP | Low | Rename an absent person or repeat an equal name. Keep the same state and avoid writes. | Rename branches allocated a new state. Identity guards now return unchanged state. No data-loss claim. |

### Evidence and fixture review

The first combined run executed 47 probes in 3.37 seconds: 23 passed and 24
failed. Receipt/name and size/no-op failures reproduced the product defects.
Fifteen provider probes instead hit a synthetic-host insertion error. Root fixed
the host by wrapping changing provider siblings in one ordinary host node. The
installed PDF reconciler lacks container insertion support.

The corrected provider fixture ran against the original cf14885 archive in
2.04 seconds: 13 passed and 8 failed. Queue/retry, pending external changes,
300 deterministic conservation/save/reload steps and migration cases passed.
The remaining failures reproduced name, size and no-op defects.

Root corrected three test-contract mistakes before integration: explicitly test
an oversized candidate separately from the reducer's unchanged rejected state;
reject unsupported canonical expansion while preserving bytes; expect invalid
names to be refused before a persistence warning. No product test was weakened
to hide a failure.

The integrated run passes all 61 probes in 5.34 seconds. It includes synchronous
selection/submission, captured-handler completion, both failure stages, pending
edit uploads, old completion during a new group's upload, supported 10,000-character
names, rejected rename correction, prompt cancellation/retry, no-op write guards,
size rejection/deletion/retry, 50,000-person bounds and migration-added size at
5,000,001 characters. The bounded 300-step conservation sequence also passes.

Evidence directory:
`/home/christian/.local/share/agent-tmp/reconcile-rounds/`.

- `round1-parent-probes.log`: original failures.
- `round1-provider-baseline.log`: corrected baseline results.
- `round1-integrated-focused.log`: 61 integrated passes.
- `round1-lifecycle-XrHfm2hP/review.txt` and
  `round1-persistence-4Xk2z0/review.md`: independent breaker handoffs.
- `round1-fresh-review/review.md`: fresh independent Astra challenge.
- `checkpoint/`: lint, typecheck, full coverage and build results.

### Independent challenge and checkpoint limits

A fresh Astra high/priority reviewer read all six changed production files and
their callers, supplied findings, fix responses and root fixture objections. It
confirmed no substantive source defect and passed whitespace review. It did not
run tests or a browser. Root implemented its bounded adjacent probes in the
61-test passing suite. The separate fixers did no heavy runs or commits.

New native-browser paste/blur, prompt retry, receipt timing and failed-upload
recovery checks are deferred to restart, as is established StrictMode replay.
Original production-browser evidence remains in browser-verification.md and does
not claim those new checks. Updated Node 20/24 verification is also deferred;
the checkpoint full gate uses the installed Node version.

Accepted limits remain published-receipt retention for other-tab drafts, manual/
legacy writers outside Web Locks, incomplete CJK/emoji font coverage, decoder
allocation before the pixel limit, and PDF rendering continuing after dismissal.
No physical mobile or real screen-reader coverage is claimed. Refunds are
unsupported; PDFs are reports rather than restorable backups.

Rounds 2 and 3 have not started. The extended goal must resume from this
checkpoint, with round 1 native verification and the remaining audit matrix open.

## Checkpoint verification and commits

Final checks pass on Node 22.22.1: lint, typecheck, full coverage with 252 tests
in 17 files, and production build. Coverage is 80.24% statements, 76.91% branches,
76.5% functions and 82.67% lines. Lint retains two existing Fast Refresh warnings;
build retains the large lazy PDF chunk warning. No rule, threshold or assertion
was weakened. Initial lint found a test probe writing during render and a
prefer-const issue. Root moved probe publication into effects and used const;
the passing full run includes those corrections.

The implementation was reviewed before these signed commits:

- `741643b` reject unsaveable state before accepting edits: consistent storage
  acceptance, retained name drafts/retries, rename no-ops and persistence probes.
- `cf22167` preserve receipts during pending expense submissions: synchronous
  pending guards, receipt ID handling, guidance and lifecycle regressions.

This ledger records the checkpoint in a separate signed documentation commit.
All three are prepared for an ordinary push to the existing topic branch. The
handoff and remote ref establish the push result. No PR, merge, release or
deployment is part of this checkpoint. All workers and owned services are stopped;
no listener remains on the earlier owned preview port 43189. After publication,
the existing goal is to be paused at the user's explicit request.

Unfinished work remains the new native receipt/name interactions, established
StrictMode replay, updated Node 20/24 checks, and the remaining independent rounds.
The original hardening evidence and accepted limits remain intact. Restart must
preserve this scope and must not treat the checkpoint as completed hardening.

## Restart after checkpoint

The user explicitly resumed the unfinished goal after publication of 997a8a8.
The checkout is clean and all three checkpoint commits are present remotely.
The latest recorded push is 2026-11-12 09:33:41 +1000. Work continues on the
existing topic branch. The earlier pause instruction is revoked. The goal tool
still reports paused and exposes no resume operation; no replacement goal or
thread was created. One source-only Sol worker owns the existing lifecycle test
file for established StrictMode replay coverage. Root owns browser and runtime
verification. The new rounds and clean-round count remain incomplete.


### Resumed native verification

The new production-browser checks pass. browser-verification.md records native
name rejection/correction, blur/focus, real prompt retry/cancellation, held decode
and IndexedDB-completion submission guards, upload failure recovery, old/new group
upload isolation and receipt associations after reload. The owned loopback
listener and tab are stopped. One mistaken file-input selector was corrected
and rerun; no product defect was inferred from that probe failure.

Five added lifecycle probes now measure StrictMode effect replay and challenge
held compression/write, duplicate submits, cleanup and new-draft preservation.
They passed in the pre-R2 runtime baseline described below, including measured
effect replay. Updated full supported-Node gates remain pending in bounded
batches with low test parallelism, releasing the lock between Node versions.

## Round 2 preparation

Two new independent source breakers prepared 44 bounded probes, with no
source-confirmed defect. Runtime results remain pending. The arithmetic/report
fixture tests 288 independent BigInt-ratio/member-order cases, 24 item-assignee
orders, every split-mode replacement pair with sequential deletion/migration,
and safe-maximum histories with pending assignment, overflow rejection and retry.
The export fixture keeps real report construction and controls PDF/browser APIs
for six failure/retry boundaries, section choices, privacy payloads, duplicate
clicks, prop changes, dismissed completion/rejection and a fresh pending modal.
Its PDF mock does not establish renderer/font privacy or native download behavior.
A fresh independent Astra reviewer is challenging these fixtures and nearby code.
No production changes or clean-round claim is made at this stage.


### R2-REPORT-NAMES

A fresh independent reviewer confirmed a supported low-severity attribution
defect by source trace: two people named Alex with distinct IDs and a 100-cent
transfer produce a report instruction Alex pays Alex. Arithmetic and stored
identities stay correct, but the report cannot identify the payment parties.
Root added a report regression and froze a pre-fix source snapshot for runtime
reproduction. This defect keeps the consecutive-clean-round count at zero.

A separate Sol fixer introduced one shared person-label lookup across reports,
payer choices, splits, items, balances, settlement and people chips. Duplicates
receive ordinal display suffixes; all existing raw names are reserved to prevent
suffix collisions. Stored names and IDs remain unchanged. Fresh Astra review
found the same ambiguity for canonically equivalent Unicode spellings. Root
normalized comparison/reservation keys to NFC while retaining raw display text,
and added that regression. The reviewer reread the correction and confirmed no
remaining substantive source finding. PDF rendering and static UI regressions
were added separately; runtime remains pending.

The first queued compiler batch passed lint and found a cyclic inferred return
type in the new export fixture. Root replaced the mounts collection annotation
with its update-only structural interface. This is a fixture correction, not a
product defect. The frozen snapshot retains the original type annotation for
runtime reproduction; TypeScript is not part of that baseline Vitest-only job.

Round 3 source-only preparation overlaps the runtime queue. Two breakers own
separate new fixtures for multi-actor storage schedules and editor transitions.
No round is counted complete from preparation or source review alone.


### Runtime baseline after restart

The pre-R2 snapshot ran 302 tests in 19 files in 18.32 seconds: 301 passed and
only the new duplicate-name report regression failed. This establishes the
reported defect without relying on source inference. All 44 round 2 breaker
probes and all five added StrictMode probes passed on the pre-fix snapshot. The
StrictMode diagnostic observed setup/cleanup/setup, so effect replay is measured.

## Round 3

Two independent breakers prepared storage schedules and editor transitions.
The storage fixture has 197 probes through real reducer/load/save APIs with
controlled lock acquisition and atomic storage failures. It covers three byte
representations, six actor orders, failure pairs, stale retries, deletion and
recreation, and candidate capture before lock acquisition. Fresh review noted
that the failure matrix placed failures before the first successful writer.
Root added three later-failure probes after a committed winner, including the
correct rule that stale revision rejection precedes a possible quota failure.
There are now 200 storage probes. Native locking is separate browser evidence.

| ID | Severity | Reproduction and expected behavior | Cause and fix |
| --- | --- | --- | --- |
| R3-DRAFT | Medium | Enter invalid Exact 4.001, Percent 25e or Shares 2e, toggle Itemize on/off. Retain the text for correction, as the form promises. | SplitEditor unmounted and lost its local raw-text map while the parent retained only NaN. A separate Sol fixer keeps it in a stable hidden, disabled fieldset. Accepted-add draft generation resets local split and receipt state. |
| R3-ID | Low | Load a valid person ID constructor, toString or __proto__, then open a numeric split. Display the numeric value rather than an inherited object/function. | The raw-draft object read inherited properties. Root added an own-property check shared by all three numeric controls and nine accepted-ID/mode regressions. Stored IDs remain unchanged. |

The editor breaker contributed ten probes for numeric typing, amount/unit
changes, Itemize retention and correction/reset, item assignment/deletion,
canonical-name identities, and removed/recreated participants. Root's nine
reserved-ID probes bring this to 19. The pre-fix snapshot ran 216 tests in 2.77
seconds: 202 passed and 14 failed. Nine failures reproduced inherited ID values
and three reproduced lost raw drafts. Two other failures came from the fixture
reusing the same React element after mocked context changes, preventing a render
of reordered/removed people. Root corrected parent element recreation in the live
harness without changing those assertions. Passing integrated results remain
pending.

A fresh Astra review accepted the hidden/disabled/reset fix by source inspection
and found no additional defect. Root found R3-ID after that review; a new final
independent reviewer is challenging the complete current state and all earlier
findings/responses. Receipt timing and native hidden-field focus/validation remain
part of root's later browser follow-up. These findings keep the clean count zero.

## Round 4 preparation

Two independent breakers added 23 new probes. Fourteen exercise real imageStore
reference/transaction sequences with an atomic IndexedDB fake. Nine render and
parse actual PDFs for every section combination and supported 10,000-character
group/expense/item paragraphs. The long-text probe checks 1,500 ordered word
markers, amounts, pending explanation and each footer.

Independent Astra source review found no supported new defect or incorrect
fixture expectation. The receipt reference-transition probe directly calls the
reference API; it does not prove provider integration. PDF extraction establishes
content and page order, not clipping or overlap. The max-text case covers group,
expense and item names, not maximum person names. Runtime and visual follow-up
remain pending, so this is not yet a completed clean round.

Round 5 source-only workflow preparation has started while the runtime queue
waits. Root continues one queued heavy job at a time; no service is running.

## Round 5

Two independent breakers prepared three real App/provider ledger workflows and
19 persistence-boundary probes. The workflows cover all five split modes,
duplicate identities, queued saves, failure and retry, deletion/reassignment,
group changes, reload and report conservation. The boundary fixture challenges
12 nested-record mutations, three raw monetary token cases and four accepted
text/identity cases. Runtime remains pending.

### R5-PRECISION

An independent reviewer confirmed a low-severity trust-boundary defect. An
externally authored amountCents token of 101.00000000000000001, item amount of
3.0000000000000001 or exact value of 51.00000000000000001 rounds to a whole
Number during JSON.parse. Validation then accepts it and a later save replaces
the original representation. The app's own serializer cannot produce these
tokens. Root froze a pre-fix fixture for reproduction.

A separate Sol fixer added a syntax-first numeric-token guard. It skips JSON
strings and uses bounded digit counts to refuse mathematically fractional tokens
that parse to whole Numbers, including nonzero underflow. Integer scientific
forms, true zeros and ordinary fractional weights remain supported. The agreed
conservative rule also refuses external percentage fractions that round wholly
to integers. No duplicate-key parser or new import feature was added.

The related Shares inputs 2.0000000000000001 and 9007199254740990.1 previously
rounded to whole shares. The editor now checks for nonzero fractional digits
before conversion, retains rejected text and accepts whole forms such as 2.
and 002.000. The fixer added 37 public load/save neighbor cases. An independent
Astra source review found no new supported defect in either fix or the regression
expectations. The frozen pre-fix run reproduced all four expected failing tests
in 1.64 seconds: three raw monetary token cases and the Shares literal check.
Thirty-four unrelated tests were deliberately filtered out. Passing integrated
regressions, native typing/submission and supported-Node gates remain unverified
for this batch.

### Resource handoff

The earlier pre-R3 acquisition expired before Vitest started. It is not a test
result. A later combined pre-R3/pre-R5 batch completed and released the lock after
the two bounded reproductions above. Root then queued the live Node 22 gate with
a 60-second execution cap, single-worker tests and disk-backed TMPDIR.
Reconcile has no active browser/server and does not retain the shared lock
between unrelated suites. No subsequent round is counted clean from source
preparation alone. Two consecutive completed clean rounds are still required.

## Round 6 preparation

Two independent breakers found no new source-confirmed defect. One added a
bounded exact-rational oracle through public load/save APIs: 504 combinations of
signs, coefficients, exponents, numeric fields and escaped-string layouts,
36 adjacent binary64 serialization cases, and 16 syntax-refusal cases. The oracle
uses BigInt numerator/denominator divisibility, independently of the production
scanner's trailing-zero comparison. Tokens are at most 40 characters, exponents
at most 324 in magnitude and records below 5,000 characters.

The other breaker added six real-provider sequences for precision-specific
initialization refusal, two canonical saves, and external rounded-cent/underflow
records with and without storage events. Captured dispatches challenge blocking
before React renders disabled controls. Complete mocked receipt-reference calls
check queued-state protection and commit/deletion ordering. The mocks do not
establish native IndexedDB durability or browser event behavior.

These fixtures were prepared while the prior batch waited for the shared lock.
No worker ran tests or changed production code. Runtime, fresh independent
challenge and publication remain pending before this can count as a clean round.

### Integrated fixture corrections

The first live Node 22 gate passed lint and typecheck. Coverage execution ran
1,173 tests: 569 passed and 604 failed across five new/extended fixture files.
There is no passing-full-gate claim. Of these failures, 595 came from fixtures
expecting schema-first JSON while saves intentionally use groups-first canonical
JSON. Root reordered only fixture object construction, preserving exact byte
assertions. Seven PDF failures used word boundaries after amounts even though
the text extractor joins adjacent fields. A digit boundary now preserves the
exact occurrence checks. The long PDF exposed the helper treating a final CR
byte as a stream delimiter; extraction now uses PDFKit's declared byte length.
The remaining mocked-context case reused children inside a Fragment. The harness
now recreates child elements while retaining component types/keys and state.
These are fixture errors, not new product findings. Affected checks must rerun.

### R6-PERCENT-INPUT

Fresh independent Astra review confirmed a low-severity caller defect by source
trace. With one participant, percentage literals 100.0000000000000001 and
99.99999999999999999 both convert to Number 100 before range and exact-total
validation. The form reports a valid split and can replace the entered text on
save. Cent conservation is unaffected, but raw range/total constraints are not
enforced. This is within the existing percentage-validation scope.

Root applied the small review fix directly. The editor rejects nonzero decimal
fractions that convert to whole Numbers, consistently with the raw-storage
precision policy. It retains text for correction; 100.000 and ordinary fractional
percentages remain supported. Two full-form regressions require invalid state,
disabled submit, zero dispatches through the direct handler, retained description
and successful correction/reset. A frozen pre-fix fixture is scheduled before
the next live gate. Runtime reproduction and passing results remain pending.

The reviewer also distinguished per-function receipt mock order from order
across writes, commits and deletions. Root added pre-release absence assertions
and shared mock invocation-order comparisons for both accepted writes. This
closes a test-evidence gap without a production change. Native IndexedDB remains
separate evidence. Round 6 is not clean; two later clean rounds are still needed.

A fresh independent fix reviewer accepted the percentage guard, canonical-order
corrections, recursive mocked-context refresh, declared PDF stream lengths and
cross-function receipt assertions by source inspection. It found the revised
amount regex still lost a final amount joined to a numeric footer. Root retained
the concatenated PDF view for literal/ordered-marker checks and added a view that
separates PDF text objects for exact monetary counts. All expected occurrence
counts remain unchanged. Runtime clearance is still pending. The frozen
percentage proof now copies current source and removes only the new guard,
avoiding unrelated differences from the earlier pre-R5 source snapshot.

### Integrated retry evidence

The frozen pre-R6 run reproduced exactly the two expected percentage-input
failures. The corrected live Node 22 coverage log reports 1,175 tests and all
28 files passing, with 89.94% statements and 85.87% branches. Lint and typecheck
exited zero. The enclosing 60-second batch timed out after coverage wrote its
complete summary, before its process exit was captured or build started. This
is a reported passing test result, not a completed four-gate batch. A separate
bounded build acquisition is now queued; further suites release the shared lock
between checks. No Reconcile browser or server is active.

Round 7 has begun with an independent actual-PDF monetary-width/layout breaker.
It owns a new fixture and cannot change production files. Receipt fallback
decoding and fault recovery form the other planned coverage area. Neither source
preparation nor the earlier tests count as a clean new round.

A new npm audit completed with exit zero and zero vulnerabilities on the
unchanged dependency lock. Origin was fetched again; HEAD and the remote topic
ref still match 997a8a8. Configured signing remains enabled with SSH format.
The sole workflow still runs push CI only on main and PR CI targeting main;
repository hook and deployment queries returned empty lists. No new external
write has occurred. Publication still awaits the remaining verification and
fresh challenge.

The latest native fixture is prepared but unexecuted. It covers duplicate/NFC
and reserved-ID labels, invalid raw Exact/Shares/Percent text across Itemize,
hidden disabled controls refusing focus, direct invalid submissions, corrected
acceptance and a new receipt after accepted-add reset. T3 preview status showed
no active tab. No service was started while the build waits.

The receipt breaker delivered 27 new fallback-decoder probes. They hold decode
and encoder completion, reverse two concurrent decodes, check exact file/pixel
boundaries and minor-axis rounding, inject constructor/URL/canvas/encoder errors,
and require complete URL ownership accounting through repeated recovery. Only
small fictional bytes and dimension metadata are allocated. Root reviewed the
fixture and source reasoning; no supported product defect was confirmed. The
fixture is not yet executed. Native decoding and browser memory behavior remain
separate checks.

The PDF breaker delivered four probes with three bounded renderer calls. A
small position calibration checks glyph advances, kerning adjustments and saved
transforms. Actual renders target MAX_SAFE_INTEGER totals, NFC duplicate parties
and reserved suffixes, and ordered long/untrusted description/item paragraphs
next to a near-maximum assigned item and one pending cent. The parser follows
xref offsets, declared stream lengths, page order, ToUnicode mappings and CID
widths. Exact monetary tokens and horizontal bounds/overlap are asserted. Root
reviewed the fixture before execution. It is format-specific evidence, not a
general PDF validator or a raster/vertical-layout check. All four remain NOT RUN.

A fresh independent Astra reviewer challenged the complete production diff and
callers, prior findings/responses and runtime-evidence limits. It found no
additional substantive production defect and closed the previous fixture
objections by source inspection. It excluded in-progress Round 7 files and ran
no checks. Approval to publish remains conditional on gates and native evidence.

To reduce repeated shared-lock acquisitions, root deliberately cancelled its
build-only waiter after verifying WRITE-star blocked status and no child process.
The owned session exited 143; no build was interrupted. It was replaced only
after that terminal result by one related integration batch, capped at 100
seconds: lint, typecheck, 31 new Round 7 probes, full coverage and build, with
individual timeouts and source hashes before/after every check. No other owner's
process or lock request was modified. Results remain pending.

### Round 7 first runtime result

The consolidated Node 22 gate acquired the lock and exited one after its focused
Round 7 checks. Lint and typecheck exited zero. All 27 fallback-decoder probes
and the PDF parser calibration passed. Three actual-PDF probes failed in the
2.97-second focused run. Coverage and build were deliberately not started.

One failure is an inline-text fixture error: the extractor joined separate PDF
text objects with newlines between person names and the literal pays fragment.
Root changed only that literal-content view to concatenate fragments, retaining
per-object monetary tokens, exact identities, occurrence counts and all layout
assertions. No product change addresses this fixture error.

The other two tests reported amount/label overlap and horizontal overflow at
maximum cents. They are position alarms, not yet confirmed product defects.
Root froze the original failing renderer fixture and production source, adding
only external PDF writes. One bounded follow-up is queued to reproduce all
three originals and independently inspect their PDFs with PyMuPDF, including
first-page rasters. An independent reviewer will challenge the glyph-position
parser before any layout fix or clean-round claim. No expectations were reduced.

A fresh Astra triage reviewer accepted the inline-fragment correction and
matched the position parser's CID widths, TJ sign and matrix composition to
the installed writer. Independent artifacts were absent at its inspection. It
found one fixture limitation: q/Q saved only CTM, so inherited font state could
be guessed incorrectly. The installed writer emits Tf for every text object,
so this cannot explain the observed failures. Root now explicitly refuses
inherited font state at BT and added a rejection calibration, rather than
expanding this narrow extractor. Existing monetary/layout assertions remain.
The independent frozen PDF comparison is still queued; no production fix is
justified yet. Round 7 now contains 32 probes.

### R7-PDF-LAYOUT, medium, confirmed

The frozen original fixture reproduced all three failures and exited one. The
independent PyMuPDF inspection completed with exit zero and preserved three
PDFs plus rasters. Its measured bounds agree with the test extractor. The first
maximum-cent amount spans x468.3869 to578.2260, beyond the existing right content
bound of559.28. Its neighboring label visibly crosses the amount in the raster.
Bold amounts extend to589.05 and the negative per-person amount to591.83. The
first PDF has ten independent out-of-margin spans; the long-item PDF has two.
The NFC-name PDF has none. These are observed product defects rather than
parser-only alarms. Numeric tokens remain exact.

Reproduction: export all sections for an exact MAX_SAFE_INTEGER expense with
long creditor/debtor/description labels, or an itemized near-maximum assigned
item and one pending cent with long paragraphs. Expected: complete readable
labels and amounts within the content margins without overlap. Actual: amounts
and long labels overlap across settlement, expense and per-person rows. The
current fixed-column/flexible-label declarations do not establish that layout.
A separate Sol fixer owns ReconcilePdf.tsx only and must identify the source
cause and preserve the existing financial/content/geometry requirements. No
fix has been integrated yet. Round 7 is not clean; the two-consecutive-clean
requirement will need later rounds.

Evidence: round7-pdf-position-proof/ contains original vitest.log, render-1.pdf
through render-3.pdf, independent-positions.json and first-page PNGs for the two
failing layout cases. Root inspected render-1-page1.png visually.

The matching production-browser maximum-cent fixture and an independent
PyMuPDF check are prepared but NOT RUN. They require all seven positive maximum
amounts, two negative amounts, two zero amounts, content margins, same-baseline
label separation and every footer. A long-paragraph native export and the
precision/draft/fallback-upload workflow also remain pending. Port43189 has no
listener. No preview was started during source implementation. Publication
planning now separates the confirmed PDF layout correction from the earlier
interface/storage changes; no files are staged and no new commit exists.

### R7-PDF-LAYOUT implementation ready

The separate fixer changed ReconcilePdf.tsx only. Installed react-pdf caches
measured Text lines across subsequent Yoga width changes. The former Text flex
items could retain lines wider than their shrunken column, including stale
alignment offsets. Also, 110 points cannot hold the supported signed bold net
maximum, approximately146.9 points at the existing 10-point font.

All six row types now allocate View columns before measuring child Text. Labels
use zero flex basis and retain a12-point inset; nonshrinking150-point amount
cells preserve right alignment and complete tokens. Metadata has an explicit
width and inset to contain wrapped trailing spaces. No truncation, fixed height,
font reduction, dependency or financial change was added. Regression assertions
were unchanged by the fixer. Whitespace review passed; runtime clearance remains
pending. The narrower label space can increase page counts.

Root reviewed the implementation and froze a post-fix copy with external PDF
writes only. One100-second related Node22 batch is queued for lint/typecheck,
the five renderer/calibration probes plus independent PyMuPDF margins and
neighbor overlap, full live coverage and build. It captures per-check exits and
source hashes. No browser/server or other Reconcile heavy job is active. A fresh
independent source challenger will receive the original failures, independent
geometry, fixture corrections, source cause and current implementation.

A fresh independent Astra fix reviewer approved the correction by source
inspection with no additional supported defect or mandatory fixture change.
It matched the reviewed PDF source to the frozen proof by SHA-256
1248f1615587bde75ac3a38f4acfe399c023dd18a5287de54e556a1455175445. It
challenged all six row types, text alignment inheritance, recursive column/page
splitting, monetary occurrence preservation, metadata and the previous fixture
objections. Runtime/post-fix artifacts were absent at its one inspection.
Approval remains conditional on full gates, native export geometry/visuals and
supported-Node checks. No clean-round claim or publication clearance follows
from source approval alone.

### First post-fix runtime and identity fixture correction

Node22 lint and typecheck again exited zero. The post-fix renderer fixture ran
five tests: four passed, one failed at the NFC identity object count. Independent
PyMuPDF inspection completed all three PDFs with zero margin or neighboring-label
overlap violations. Root inspected the maximum-cent raster and confirmed the
readable separated columns. The gate stopped before coverage/build because the
fixture exit was one. This is geometry evidence, not a completed gate.

The remaining count assumed every standalone name object was a balance or
person heading. Transfers also emit separate from/to name objects; these were
never reached by the original failed NFC literal test. Root now identifies the
required balance/person rows by their unchanged literal signed net amounts and
same-baseline separated geometry. Each person must still appear in exactly two
such rows. Both transfer instructions, item assignments, literal suffixes, exact
amounts, immutability and all bounds remain required. No count was relaxed.
Original results/PDFs are preserved under round7-postfix-proof/attempt1 and
resumed-gates/round7-fix-attempt1 before the corrected rerun.

### Corrected focused pass and full-suite obstruction

The corrected five-test PDF fixture exits zero. Independent PyMuPDF examination
of its three generated PDFs finds no margin or neighboring-label overlap.
Node22 lint and typecheck also exit zero with stable source hashes. The following
full coverage run completes in46.43seconds with1,206passes and one failure across
30files. Build is deliberately not started.

The failing existing regression cannot find the Per person heading in its
extracted pages after the new column layout. Its expected Alex net13.56 and
paid25.48 literals remain unchanged. This is not yet classified as a product or
fixture defect. Root froze the exact source/test and added external PDF writes
for independent text/geometry inspection. That25second diagnostic is queued
under the shared lock. No expectations have been weakened.

Two small independent Round8 breakers are preparing receipt-viewer URL/dialog
lifecycles and theme/system-event recovery in separate owned fixture files.
They run no heavy jobs. Preparation does not count as completion of either round
or as a clean audit. The current goal tracker is active.


## Final publication boundary, 13 November 2026

The user's final instruction ends audit expansion and supersedes the earlier
requirement to run two more clean rounds. No new audit rounds or delegates were
started. Historical preparation and queued status above are retained as history.
The cancelled jobs did not resume themselves. No Reconcile worker or preview
process survived the restart. Existing independent reviews are preserved under
`docs/reviews`; they describe the source and limitations at their review times.

A fresh bounded Node 22 baseline completed with exit 1, 1,247 passing tests and
five failures across 32 files. The two theme failures and two receipt failures
reproduce the prepared round 8 findings. The fifth is a test extractor defect.
The saved PDF independently parses with PyMuPDF to show `Per person`, `Alex`,
`net $13.56` and `paid $25.48` on page 2. The extractor's TJ-array regex previously
consumed the preceding empty graphics dash array and swallowed the first font
selection. Limiting the match to one bracket pair fixes the extractor without
changing the heading or any monetary/content assertions.

The system theme now uses React's external-store subscription, which rechecks
the snapshot after subscription. Startup invalid-choice handling matches the
provider's system default. Receipt thumbnail and viewer results now carry a
load identity so returning to the same image ID cannot expose a URL revoked by
an earlier load. Stored blobs and draft receipt ownership are unchanged. The
component regression is real; an ordinary UI route to the ABA prop sequence
remains unproven. These small final corrections received owner source review,
not another independent audit. Final gate results and remaining acceptance gaps
are recorded in `final-handoff.md` and the draft pull request.


Final local gates completed with exit zero on the frozen source. Node20.20.2,
Node22.22.1 and Node24.22.2 each pass all1,252tests in32files, typecheck and
production build. Node22 lint exits zero with the two existing Fast Refresh
warnings; coverage is93.44% statements and88.88% branches. Builds retain the
large PDF chunk warning. Full commands, failed attempts and acceptance gaps
are in `final-handoff.md`. No new native-browser or independent-review claim
is made. Publication remains draft, followed by the user's requested pause.
