# Reconcile final handoff

This handoff covers `C-Nucifora/reconcile-app`, the browser-only expense splitter.
Checkout: `/home/christian/Documents/dev/reconcile-app`.
Branch: `hardening/audit-cycles-20261112`. Base: `main` at
`13fece900d952963f0390296d704b86206b70e34`.

The latest reliable push is the tracking reflog's `update by push` at
2026-11-12 09:33:41 +1000 for `997a8a8`. No matching public push event was
available. This is a personal project. New commits use a short uneven window
within the subsequent day and configured SSH signing. Published history stays
intact. The existing branch is neutral and contains the earlier published
hardening checkpoint. The PR compares the whole branch with main.

## Changes

- Retain split drafts across itemized mode changes; distinguish duplicate and
  canonically equivalent person names consistently in controls and reports.
- Reject JSON source fractions that Number conversion silently rounds to
  integers. Preserve the original stored record on rejection.
- Allocate PDF columns before text measurement, including maximum-cent amounts.
  Correct the test extractor's stream lengths and single-array text parsing.
- Keep system theme snapshots current and startup defaults consistent. Associate
  receipt URLs with their load, including replacement back to the same ID.
- Preserve the prepared arithmetic, persistence, workflow, PDF, decoder, theme
  and receipt regression cases and the completed independent review reports.

## Verification

All final local gates completed with exit zero on unchanged source.

| Runtime | Checks | Result |
| --- | --- | --- |
| Node 22.22.1 | npm run lint, npm run typecheck, npm run test:coverage with one worker and no file parallelism, npm run build | Pass. 32 files, 1,252 tests. |
| Node 20.20.2 | tsc --noEmit, Vitest with one worker and no file parallelism, Vite build | Pass. 32 files, 1,252 tests. |
| Node 24.22.2 | tsc --noEmit, Vitest with one worker and no file parallelism, Vite build | Pass. 32 files, 1,252 tests. |

Node 22 coverage is 93.44% statements, 88.88% branches, 93.98% functions and
95.60% lines. Lint exits zero with two existing Fast Refresh warnings. Builds
exit zero with the existing large react-pdf chunk warning. No test expectation,
coverage target, chunk threshold or branch protection was lowered. Whitespace
review passes. Hosted CI is not represented by these local results.
Raw results, failed attempts, cancellation records and source hashes remain in
`/home/christian/.local/share/agent-tmp/reconcile-final`.

The fresh pre-correction baseline exited 1 with 1,247 passes and five failures.
All 60 focused cases passed after the first corrections. Subsequent typecheck
caught a remaining thumbnail status-label reference. That reference was fixed,
and the full gates were restarted. The first lint/typecheck lock requests were
cancelled before execution so these small checks could run without the heavy
lock. Heavy tests and builds acquire the shared lock per bounded suite.

## Acceptance gaps and limits

The PR must remain draft. No fresh production-browser check was run for the
final integrated UI, PDF, theme or receipt changes. The earlier desktop/mobile,
keyboard, native storage and PDF evidence in `browser-verification.md` applies
to its documented checkpoint. Final small theme/receipt fixes have owner review
and regressions, without another independent review of that exact source.
No further audit rounds were started. The earlier two-clean-round acceptance
criterion was not achieved before the user instructed publication and stop.
Hosted PR CI results are separate from local results.

Receipt ABA user reachability remains unproven despite the reproduced component
contract failure. Accepted limits remain noncooperating writers outside Web
Locks, retention of published receipt blobs, incomplete CJK/emoji font support,
decoder allocation before pixel-bound checking and rendering continuing after
export dismissal. Refunds are unsupported. Settlement is deterministic but has
no minimum-transfer-count guarantee. PDFs omit receipt images and are not
restorable backups. Physical-device and screen-reader acceptance is unverified.

No Reconcile server, browser or worker remains from the interrupted session.
No new preview, tunnel, firewall or production change was made. Existing host
services were left alone. The GitHub workflow performs verification and coverage
upload only. Main remains protected. No protections were disabled.

RACK, the earlier terminal portfolio and dashboard research are outside this
owner's Reconcile changes and were left untouched. The pre-existing dirty
`uq-course-planner/docs/swarm-rounds.md` was also left untouched.

## Existing published commits retained

```text
f11627df1593485f390f96b955430921f05b9087 patch tooling dependencies and keep previews private
202471d2eecb7c9d7b9b16ae08051a5342c4206b conserve integer cents across splits and settlements
c459a48eb606c18744540c3cc27a9989fe66e134 preserve local data and rejected expense drafts
cf148851d19cec7fb37b403ee9244316fe04021f harden pdf exports and document verified behavior
741643b588029c990bb706016dd257f6a7da4956 reject unsaveable state before accepting edits
cf22167841be852dbb77a45cce2ba2c31cd92348 preserve receipts during pending expense submissions
997a8a82b19dd9cdb7359a114803883ca1c120e3 record audit checkpoint and remaining verification
```

The final added commits and PR URL are included in the owner's final handoff.
