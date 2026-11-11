# Extended audit rounds

The extension starts from `cf14885`, following the original hardening pass.
The user requested at least three new rounds and then two consecutive clean
independent rounds. On 12 November 2026, the user requested a checkpoint and
pause before further swarms or rounds. Those extended requirements remain open.

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
