# Integrated rounds 2 through 6 source review

No additional substantive production defect was found in the integrated changes. The previous PDF counting objection is closed by the current extraction correction. No mandatory source or fixture fix is requested from this review. Publication remains conditional on the pending verification gates. This report establishes neither a completed audit round nor two consecutive clean rounds.

Reviewed on 12 November 2026 in `/home/christian/Documents/dev/reconcile-app`, branch `hardening/audit-cycles-20261112`, HEAD `997a8a82b19dd9cdb7359a114803883ca1c120e3`. The reviewed production changes are the working-tree diff against that HEAD plus the untracked `src/lib/personLabels.ts`. They are not changes already committed in HEAD. The local remote-tracking reflog records the last push at `2026-11-12 09:33:41 +1000`. No remote query was made.

Read `docs/audit-rounds.md`, the round 2, 3, 4, 5 and 6 external review and fix reports, the two round 6 breaker reports, the actual production diff, all eight person-label callers, and the form, validation, reducer, storage, provider, receipt-reference and export paths needed to challenge the changes. Inspected the relevant current regression assertions, fixture corrections and retained evidence. The new round 7 PDF and decoder fixtures and their reports were excluded. Their owners' work is not approved by this review.

Only this external report was written. No production or test edits, runtime probes, tests, lint, compiler, build, browser, server, install, lock acquisition, commit, push or nested agent was used. `git diff --check` passed for the tracked diff. That is a whitespace check, not runtime validation.

## Production objections and responses

### Duplicate identities and labels

The original supported reproduction was two distinct people named Alex and a 100-cent transfer rendered as `Alex pays Alex`. The later objection used canonically equivalent `é` and `e\u0301`, which exact string comparison failed to distinguish.

The current [personLabels.ts](/home/christian/Documents/dev/reconcile-app/src/lib/personLabels.ts:3) counts and reserves NFC comparison keys, reserves every original name before allocating labels, and reserves each generated label. Its suffix counter advances within each normalized name family. A literal `Alex (1)` cannot be impersonated by a generated label, including when that literal appears later in the list. The displayed spelling and stored people remain unchanged.

All eight callers use the whole group's people list. Payer options, split members, item assignment, rename/remove actions, expense summaries, balances, settlement and report construction retain ID-based behavior. Rename inputs still start with raw names. Reducer rename/removal replaces the people array, invalidating the relevant memoized maps. Group changes remount the workspace. I found no filtered-list labeling mismatch or missed raw person-name financial display in these callers.

Labels can renumber after membership or name changes. They are presentation values, not durable identifiers. NFC uniqueness does not promise general visual-confusable detection, glyph coverage, or native truncation behavior. The label tests and static markup assertions must not be described as proving those properties.

### Draft retention, reset and reserved IDs

The original invalid Exact `4.001`, Percent `25e` and Shares `2e` strings could not be reconstructed from the parent's NaN after Itemize unmounted SplitEditor. [ExpenseForm.tsx](/home/christian/Documents/dev/reconcile-app/src/components/ExpenseForm.tsx:434) now preserves the child in a stable hidden, disabled fieldset. The conditional item editor occupies a separate preceding position. No class overrides the hidden state, and there is no legend control escaping fieldset disabling.

Submission and validation select the active mode. An invalid hidden split does not enter the itemized payload or its validity calculation. Rejected dispatch returns before reset. Accepted Add resets parent drafts and increments the shared split/receipt key. ReceiptUpload stays outside the hidden fieldset and keeps its key during toggles. The provider protects current and queued receipt IDs synchronously before accepted-add cleanup can request collection. Group and edited-expense identity boundaries remain intact.

The own-property lookup at [SplitEditor.tsx](/home/christian/Documents/dev/reconcile-app/src/components/SplitEditor.tsx:199) serves all three numeric controls. Computed property writes create an own `__proto__` data property; object spread and deletion do not invoke the legacy prototype setter. `constructor` and `toString` also fall back to the numeric member value until an own draft exists. No additional prototype-dependent draft lookup was found.

The synthetic editor host cannot establish native hidden/disabled enforcement, focus, constraint validation or event bubbling. Its ReceiptUpload mock also cannot prove receipt continuity. Those limits remain even when the assertions pass. The supplied native follow-up for these integrated changes remains pending.

### Numeric input and persistence

The Shares grammar refuses nonzero fractional digits before Number conversion. The Percent guard refuses a decimal fraction erased into an integer Number. It therefore rejects both `100.0000000000000001` and `99.99999999999999999`, while preserving `100.000`, `2.` in Shares, and ordinary fractional percentages such as `33.30` and `66.70`. Raw text is saved first, NaN reaches shared split validity, and the form's submit handler checks that validity before dispatch. The direct-handler regression makes disabled UI alone insufficient to pass.

This is the documented conservative precision policy. Rounding between noninteger Numbers is still possible and was not promised away. The change does not establish arbitrary-precision percentage arithmetic. The exact currency parser remains separate.

The scanner at [storage.ts](/home/christian/Documents/dev/reconcile-app/src/state/storage.ts:279) has one production caller, after bounded input and successful JSON syntax parsing. The string walk correctly consumes escaped quotes and backslashes. Numeric tokens outside strings are consumed once. For an integer-valued Number, a nonzero decimal coefficient is mathematically integral exactly when its exponent cancels the fractional digit count after trailing zeros. The implementation uses that comparison and rejects nonzero underflow. Huge exponent conversion cannot reverse the comparison against a threshold bounded by document length. Zero coefficients remain accepted.

Load preserves original bytes on refusal. Locked save compares exact revisions first, then validates the matching stored bytes before replacement. Candidate serialization occurs before waiting. AppProvider blocks edits after invalid initialization or a stale write through synchronous refs. Real image cleanup separately refuses deletion when saved-state loading reports an error. No raw JSON production import bypass was found; the reducer's IMPORT_STATE receives an already constructed object.

Ordinary finite JSON.stringify output does not conflict with the scanner. Whole-document refusal of external percentage/equal-weight fractions rounded to integers is intentional. Storage's allowance for percentage weights not totaling 100 is also intentional after membership changes; the form's exact-total requirement must not be imposed on the storage oracle.

## Fixture objections and responses

- The PDF helper now uses declared compressed byte lengths and keeps two extraction views. Its monetary view inserts a newline at each `ET`, while preserving glyph fragments within each text object. Thus a final `$1.23` and numeric footer no longer become `$1.231 / 1` for counting. The literal/ordered-marker view remains concatenated. Expected positive counts remain two for settlement, one for expenses and four for per-person details; negative counts and both pending-amount occurrences remain required. The long-paragraph test still requires three `$7.91` occurrences, all ordered markers and every footer. This closes the prior fixture defect without reducing expectations. It remains a PDFKit-specific content extractor, not a proof of visual bounds, clipping or overlap.
- Canonical root ordering now agrees with `sanitizeState`, which emits groups, activeGroupId, then schemaVersion. Exact-byte, error-specific and no-write assertions remain. This corrects fixture construction rather than relaxing preservation. Earlier failures at canonical setup did not exercise the later numeric branches; the later integrated result is the relevant reported execution evidence.
- Recursive `freshElement` recreates Fragment children after mocked context changes. It preserves component types and stable reconciliation keys for these fixtures. Each update starts from the stored original element, avoiding cumulative key transformation. Existing selected-payer and raw-draft assertions still challenge accidental remounts. It is a mock-context correction, not a production rerender workaround.
- The provider tests now assert no early commit/deletion while the first lock is held and compare shared invocation order for each write, commit and cleanup request. Exact call counts and the mount-commit offset are correct. This closes the prior cross-function ordering gap. The assertions establish mocked invocation order after synchronous fake storage writes, not native disk durability or completion of asynchronous blob deletion.
- The round 6 numeric oracle uses bounded BigInt rational divisibility, independent of the production trailing-zero comparison. Its 504 generated cases, 36 Number neighbors and 16 syntax cases are bounded samples. They do not establish a complete finite-Number sweep or measured full-size parser performance. Fake locks and transaction schedules likewise do not establish native arbitration.

The frozen pre-R6 SplitEditor now differs from live source only by the new Percent guard and its comment. The retained JSON result identifies exactly the two intended failing percentage assertions, with 19 other tests skipped. The earlier objection that this snapshot also omitted the Shares fix is therefore closed for the current frozen source.

## Evidence and publication recommendation

I read [node22-retry-coverage.log](/home/christian/.local/share/agent-tmp/reconcile-rounds/resumed-gates/node22-retry-coverage.log). It reports 1,175 passing tests across 28 files in 40.99 seconds, with 89.94% statements and 85.87% branches. It contains a complete coverage summary, but no captured process exit. The supplied outer-wrapper exit 124 must not be represented as a successful full gate. The supplied lint/typecheck exits are zero; the lint artifact retains two Fast Refresh warnings. The dependency audit JSON reports zero vulnerabilities, consistent with the supplied audit exit zero.

At inspection, the dedicated build-completion log was empty and the captured-exit rerun had no result artifact. The queued waiter 74573 is owner-supplied status, not a result independently checked here. The prepared 28-file rerun list excludes the new round 7 fixtures, so its eventual result must retain that scope.

The current ledger introduction and integrated-retry section correctly distinguish passing test output from completed gates. Earlier preparation sections are historical and must not be quoted alone as current status. Round 1 native evidence remains specific to its documented checks, including a delayed application IndexedDB callback rather than delayed disk durability. It does not certify the new hidden-field or numeric-input behavior. The latest native fixture is recorded as prepared but unexecuted.

I have no source-review objection to publishing this integrated fix batch once root captures successful coverage exit and build completion, finishes the required supported-Node and native checks, ties results to the final source, and updates the ledger with their actual outcomes. Any later production fix needs its own review and relevant checks. Round 7 work requires separate triage and verification. This review does not satisfy the outstanding two-consecutive-clean-round requirement, and the clean-round count remains zero.

Accepted limits remain published-receipt retention, noncooperating writers outside Web Locks, incomplete CJK/emoji fonts, decoder allocation before the pixel bound, rendering continuing after export dismissal, unsupported refunds and settlement without a minimum-transfer guarantee. No physical-device or real screen-reader evidence was added.

No runtime or native checks were performed here. Publication approval is conditional; the pending gates and round 7 findings remain root-owned.
