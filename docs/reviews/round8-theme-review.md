# Round 8 theme event test preparation

Tests NOT RUN. This is source analysis and preparation of 31 bounded cases, not a passing suite or a clean round. Two probes are expected to expose source-backed candidates on the reviewed snapshot. Their runtime behavior still needs root's execution and triage.

Work was confined to `/home/christian/Documents/dev/reconcile-app` and this external note on 12 November 2026. HEAD is `997a8a82b19dd9cdb7359a114803883ca1c120e3`, branch `hardening/audit-cycles-20261112`. The branch has no commits beyond its upstream. Its latest local remote-tracking reflog entry marked `update by push` is `2026-11-12 09:33:41 +1000`. The authenticated GitHub events read returned no matching branch push event. The local reflog is the available push evidence. No commit span was prepared because the task explicitly prohibits commits.

No applicable filesystem AGENTS.md was found in the repository or its ancestors. Applied the supplied AGENTS instructions and read ponytail, realistic-commits and unslop. Read the theme provider, resolver, toggle, main StrictMode wrapper, startup script, original theme specification, test configuration, existing lifecycle/provider test fixtures, installed reconciler selection and audit execution policy. No design change was requested, so no design profile was applied.

Only these new files were written:

- `/home/christian/Documents/dev/reconcile-app/src/theme/round8-events.audit.test.tsx`
- `/home/christian/.local/share/agent-tmp/reconcile-rounds/round8-theme-review.md`

## Prepared coverage

| Cases | Contract challenged |
| --- | --- |
| 4 initial choices | Explicit light and dark override the OS; system resolves both OS states. The stored value remains the choice. |
| 1 system event sequence | Repeated changes, including duplicate events, update context and the dark class without storing resolved OS values or adding listeners. |
| 2 explicit event sequences | Both explicit choices survive OS changes. Returning to system uses the latest tracked OS state. |
| 1 cycle/remount sequence | A captured cycle callback follows system, light, dark, system; two batched cycles compose correctly. Remount loads the durable explicit choice. |
| 1 subscription-gap probe | A child layout effect delivers a bounded OS change before the provider's passive subscription. The settled system choice must reflect the current OS. |
| 7 missing/corrupt values | Null, empty, uppercase, padded, JSON string, JSON object and fictional garbage recover to system. A successful write canonicalizes the theme key. |
| 4 denied-storage sequences | Read denial, write denial, both, and a missing global leave controls usable. Failed writes leave bytes absent; restored access persists the next choice, which survives remount. |
| 2 media availability sequences | Missing or throwing matchMedia falls back to light for system while explicit dark remains usable. A later remount with media restored resolves current system state. |
| 1 failed-write remount | An in-memory light choice can work while writes fail. Remount restores the older durable dark preference. This is an accepted best-effort limit. |
| 4 startup agreements | Execute the actual index.html inline script for canonical light, dark, system and missing storage. Require agreement with the mounted provider and no startup write. |
| 1 denied-read startup recovery | The documented startup fallback is light when reading storage fails. The provider subsequently recovers to system dark without throwing. |
| 1 corrupt startup agreement probe | Invalid stored choice uses the provider's system default before and after takeover, avoiding a class mismatch. |
| 1 ownership sequence | Four real provider mount/unmount cycles use fresh MediaQueryList objects. Cleanup removes the exact owned callback from its original object, preserves a foreign callback and leaves no provider listener. Later events cannot write storage or change the root class after unmount. |
| 1 StrictMode sequence | Require observed setup, cleanup, setup before asserting one live subscription, current system tracking, explicit override and complete final cleanup. Every list's removals must match its own registrations. |

The fixture reuses the installed `@react-pdf/reconciler` host style and ordinary audit-root wrapper. Production ThemeProvider, useTheme, resolveTheme and the inline startup script stay real. Only storage, media delivery and the root class list are fictional. Each matchMedia call returns a distinct list sharing the same OS state, so incorrect cleanup against a new list cannot pass accidentally. A sentinel unrelated class and unrelated storage entry must survive observed transitions. No timers, network, app data fixtures or cross-tab theme events were added.

## Source-backed candidates awaiting execution

1. **System snapshot can become stale before subscription.** `src/theme/ThemeContext.tsx:57` reads the OS in a lazy initializer. The passive effect at line 79 requests a new list but never reads its current matches value, then attaches the listener at line 91. A change between the initial read and listener registration has no path into state until another event. The probe at `src/theme/round8-events.audit.test.tsx:203` injects that ordering through a child layout effect, asserts no subscription exists yet, and expects system dark after mounting settles. On current source it should observe system light instead. This is a deterministic synthetic schedule, not a native-browser reproduction or a measured frequency claim. The intended rule is that settled system mode follows the current OS; it adds no cross-tab feature.

2. **Corrupt preference gives inconsistent startup and provider defaults.** `index.html:18` treats only null and the literal system choice as OS-following. For fictional garbage with dark OS, it chooses light. `src/theme/ThemeContext.tsx:22` through line 33 rejects that same garbage and defaults to system; its mount effect then applies dark. The probe at `src/theme/round8-events.audit.test.tsx:297` executes the actual script, captures its class, mounts the real provider and requires the same system default. It should fail its final startup-dark assertion on current source. This challenges the existing startup comment that the script must agree with src/theme, plus the theme specification's no-flash takeover rule. Impact is a possible startup class change, not ledger corruption. If root explicitly accepts corrupt preferences as an exception to no-flash takeover, classify this as a contract decision instead of a mandatory fix. Physical paint timing is unmeasured.

These are ordinary assertions, not skipped tests or expected-failure wrappers. Root should retain the failure output before deciding whether a minimal production change is justified. No production fix was attempted here.

## Accepted limits and contract distinctions

- Preference writes are best-effort. Successful in-memory choice changes do not guarantee durable storage, automatic retries or persistence after remount. The denied-write tests allow that behavior and explicitly check the durable fallback.
- Invalid preference bytes may be replaced with system after a successful mount write. Theme preferences do not inherit the ledger's corruption-preservation/recovery contract. The unrelated fictional storage sentinel must survive.
- A throwing storage read makes the startup script choose light by documented policy. The later provider can recover to system dark. That deliberate fallback is covered separately from the ordinary corrupt-string mismatch.
- One owned media listener during the provider lifetime is compatible with tracking OS changes while an explicit theme is active. The contract concerns visible resolution and exact cleanup, rather than detaching whenever the choice is explicit.
- The production root uses StrictMode. The installed React 19.2.7 selects the reconciler's 33 implementation and an existing audit fixture has a replay diagnostic. The new test independently requires that diagnostic before claiming replay coverage. A failed diagnostic is a fixture limitation to investigate, not proof of a product bug.
- No storage-event synchronization, concurrent ThemeProvider arbitration, legacy addListener-only browser support or live recovery of a newly available matchMedia API was invented. Recovery of media availability is tested through remount.
- The provider is the root class owner while mounted. Its final class may remain after unmount; the ownership test checks that later events do not mutate it. It does not impose class restoration on cleanup.

## Evidence and root handoff

Source-read the complete new test and traced every expected transition against the provider and startup script. A source-only `git diff --no-index --check /dev/null src/theme/round8-events.audit.test.tsx` emitted no whitespace diagnostics. Its exit status was 1 because this is an added-file no-index comparison. No Node runtime, test, compiler, lint, build, browser, server or other application job was started. No lock was acquired, and no subdelegates, production edits, commits or pushes were made. Other files were preserved.

Reviewed source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| src/theme/ThemeContext.tsx | b47896ad23ae3660cd7279ba05dd17bab28a04a5281481ac8393fa93da559772 |
| src/theme/theme.ts | bb32e95e54a669f2a3fe0d40a981931dfcb72abb588be38a4545bec13e4ac0eb |
| index.html | 1bdb7aa1c93351a5ddb79cd9a6655bf463870737eaa612d78886f12b53f45f66 |
| src/theme/round8-events.audit.test.tsx | f04d363fbf741ae9d7e66689d3cf634f04782102a0eaa7af33a99870aa63b071 |

Root's exact targeted command, using its supported Node environment:

```bash
cd /home/christian/Documents/dev/reconcile-app && flock -w 900 /home/christian/.local/state/agent-swarms/heavy.lock timeout 60s env TMPDIR=/home/christian/.local/share/agent-tmp npm exec -- vitest run src/theme/theme.test.ts src/theme/round8-events.audit.test.tsx --maxWorkers=1
```

Root also owns typechecking and lint under the same lock. Fixture type/lint correctness and reconciler scheduling remain unverified until those checks run. This preparation does not claim native browser event timing, paint behavior, physical mobile or screenreader coverage. The supplied prior checkpoint is 1206 passing tests for persistence corruption/queued-save work. The separate R7 PDF heading-extraction failure remains under triage; nothing here establishes a clean R7 or R8 round.
