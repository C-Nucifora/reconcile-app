# Round 8 viewer preparation

Added 14 unexecuted cases in `/home/christian/Documents/dev/reconcile-app/src/components/round8-viewer.audit.test.tsx`. Source review supports one URL ownership defect in ReceiptViewer and the same defect in ReceiptUpload. Two cases are expected to fail against the reviewed source. These are predictions from source, not test results. Root owns all execution under the shared `heavy.lock`.

Only the new fixture and this report were written. No production edits, existing-test edits, commits, pushes, installs, browser sessions, servers, runtime jobs or subdelegates. The unrelated dirty checkout was preserved. No refusal occurred and no refused operation was retried.

Read the supplied AGENTS instructions and the unslop, ponytail and realistic-commits skills. No filesystem AGENTS.md was found in the repository or its ancestor chain. Reviewed current ReceiptViewer, ReceiptUpload, ExpenseList, the ReceiptUpload caller in ExpenseForm, AppContext storage updates, imageStore's read contract, round 1 lifecycle probes, round 2 export fixture conventions, receipt decoder tests and the browser-verification ledger. Existing receipt coverage addresses upload persistence/cancellation, decoding and ordinary corrupt-image closure. This fixture adds viewer request generations and listener ownership rather than repeating those workflows.

The current branch is `hardening/audit-cycles-20261112`, inspected at HEAD `997a8a8`. Its remote-tracking reflog records the last `update by push` at 2026-11-12 09:33:41 +1000. There are no commits beyond its upstream. A read-only hosting push-event lookup returned no matching event. No timeline or history was changed.

Reviewed source blob IDs:

- ReceiptViewer.tsx: `f8240a2a7d86461bfe884b109d0d0c2a7ac5bc19`
- ReceiptUpload.tsx: `4be879e6a9d1e0a8ed051dd7b064da9fe0f773a9`

## Supported source finding

R8-URL-ABA: returning to an image ID can reuse an object URL whose owning effect has already revoked it. This requires the first request to have completed, then two committed ID changes before the intervening request completes. The ordinary A-to-B stale-display guard is insufficient because it compares only the ID.

ReceiptViewer reproduction trace:

1. Mount with fictional A. Resolve its read to `blob:fictional-a-retired`. ReceiptViewer.tsx:37 stores `{ imageId: A, url: retired }`.
2. Change to fictional B and hold its read. The existing guard at lines 20-22 hides A correctly. The A effect cleanup at lines 40-43 revokes `retired`. The loaded state still holds A and that URL.
3. Change back to A before B resolves. A new read starts because the effect depends on imageId, but lines 20-22 accept the retained A state immediately. The rendered image at lines 102-106 receives the revoked URL while the fresh A read is pending.
4. If that currently rendered image reports an error, its current onError sets A to missing. The missing effect calls onClose. ExpenseList.tsx:191-199 supplies an onClose that clears selection, so the viewer unmounts. The fresh A result is then revoked by the inactive-request branch rather than displayed.

The regression uses a small OwnedViewer matching the caller's unmount-on-close behavior. It first asserts that no image uses the retired URL and that loading text is present. It conditionally invokes onError only on the retired image if that image is still rendered at that moment. It never saves and invokes a detached image's old handler. This models the consequence without claiming browser error delivery was observed. A corrected viewer renders no retired image, so the conditional error dispatch does nothing and the fresh read displays normally.

Caller support and limit: ExpenseList selects an expense ID and passes that expense's receiptImageId to an unkeyed ReceiptViewer. Its structure allows the prop to change without remounting if that expense changes, which supports the component's request-change contract. However, AppContext's storage handler at lines 90-101 blocks editing and requires reload rather than adopting another tab's snapshots. Cross-tab live replacement is therefore not an established route. The modal also blocks the ordinary underlying edit controls. No normal current UI path producing A-to-B-to-A in the same mounted viewer was established. Treat this as a confirmed component-contract defect with unproven current user reachability. The source-confirmed result is reuse of a URL already passed to revokeObjectURL. Actual native image error timing remains unexecuted.

ReceiptUpload has the same retained-state issue at lines 38-39 and 52-66. Resolve A's thumbnail, open its lightbox, change to B with its read held, then return to A. Cleanup has revoked A's URL, but thumbnail.imageId again matches the prop. Both the thumbnail and lightbox can render that revoked URL. Because lightboxOpen remains true, the effect at lines 70-80 also registers a keyboard listener again before the fresh A read completes. The second failing probe asserts no images, dialog or listener during this pending interval, then settles both remaining reads and checks exact URL release order.

ReceiptUpload reachability is narrower. Its prop contract permits replacement, but ExpenseForm normally uses newly generated image IDs, clears IDs on removal and remounts children on accepted-draft reset. No current ordinary user action that restores the exact prior A ID into the same ReceiptUpload instance was established. Treat this as a confirmed component-contract defect with unproven current UI reachability, not a second demonstrated user incident.

No data-loss or persistent receipt deletion follows from either trace. A revoked presentation URL is reused; the stored blob remains available. A fix needs to distinguish the current load's ownership from an earlier completed request for the same ID. No production implementation was attempted.

## Exact new probes

| Cases | Probe | Contract checked |
| --- | --- | --- |
| 2 | Superseded URL or missing result after B is ready | Old URL revoked once, old null does not close, B stays visible and is revoked only on unmount. |
| 1 | Three held reads for A-to-B-to-A | First A completion cannot overwrite the second A request; stale B null cannot close it. |
| 1 | Ready A-to-held B-to-held A | The retired URL stays out of rendering, cannot close the fresh request via its error, and fresh A displays. Expected failure by source. |
| 1 | StrictMode discarded and live reads | The viewer effect actually produces two reads; discarded completion is revoked without releasing the live replay URL. |
| 3 | Escape, Close button and backdrop during a held read | Caller unmounts, focus restoration is requested, listener removed, late URL revoked, later Tab/Escape do not act. |
| 2 | Unmount and reopen the same ID, then old URL or missing result | Old instance cannot affect the new instance's ready URL or close callback. |
| 1 | Current missing result with a real unmounting owner | Closure removes the key listener, requests opener focus and leaves Tab uncancelled. |
| 1 | Replace onClose while retaining the same image ID | No reload or revocation, latest callback only, one active listener, forward/reverse Tab trapped, unrelated key uncancelled, cleanup releases URL and focus. |
| 1 | Upload lightbox close, reopen and removal | Closing preserves the thumbnail's URL; removal and owner prop update release it once, without attempting to delete an existing published blob. |
| 1 | Open upload A-to-held B-to-held A | No revoked thumbnail/lightbox or premature key listener, stale B URL released, fresh A is the only later source. Expected failure by source. |

Every afterEach unmounts its roots and compares the complete addEventListener and removeEventListener argument lists. URLs use distinct fictional strings; per-case assertions check exact revocation calls where ownership matters. No real blob or image allocation occurs. Each case uses at most three held reads, no loops beyond fixed fixture values, no timers, polling or waits. Successful paths settle all held reads; an early assertion failure may leave an inert unresolved Promise with no runtime job or allocated resource behind.

## Boundaries and unexecuted hypotheses

The fixture uses the already installed @react-pdf/reconciler style, real React state/effects and an EventTarget for key dispatch. It replaces createPortal with an identity function because this host renderer does not provide native portal behavior. Focus methods update a fake activeElement so tests establish which element receives a focus request. They do not establish browser focus behavior, especially focus on detached upload thumbnail buttons.

getImageURL is mocked only at its documented boundary. The real function catches storage and object-URL failures and resolves null. Rejected promises are outside its supported contract, so the fixture does not invent a rejection bug in viewers that call .then without .catch. Stale missing results are covered instead. It also does not invoke callbacks from removed DOM nodes to manufacture stale error failures. Native delivery of an already queued error after DOM removal is an unexecuted hypothesis and is not a finding here.

No new screen-reader, browser decode, event bubbling, native focus, multiple simultaneous modal, cross-tab scheduling or real IndexedDB claims. The prior accepted decoder-allocation bound and published-receipt retention limits are unchanged. Round 7's PDF heading-extractor triage is unrelated and was not touched.

Static review and `git diff --no-index --check /dev/null src/components/round8-viewer.audit.test.tsx` completed without whitespace diagnostics. No Vitest, typecheck, lint, coverage or build was executed. Root should first run `npm test -- src/components/round8-viewer.audit.test.tsx` under its shared heavy.lock, retain the exit status and output, and distinguish fixture failures from the two predicted source regressions before integrating a fix.
