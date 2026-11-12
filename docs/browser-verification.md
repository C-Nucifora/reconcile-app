# Production browser verification

Verified on 12 November 2026 Brisbane time using fictional data and T3's server browser in a fresh incognito context. Production `dist` was served by Vite on `127.0.0.1:43189` with `--strictPort`. The listener was inspected before access. No tunnel or public route was created. Build/test temporary files use `/home/christian/.local/share/agent-tmp`; verification is serialized.

## Completed checks

| Workflow | Evidence |
| --- | --- |
| First group and people | Created Fictional coastal trip with Alex, Sam and Élodie using the group prompt and person input with Enter. Default split includes all three. |
| Equal split and duplicate click | A $10.01 expense paid by untouched default Alex saved once on double-click. Balances are Alex +$6.67, Sam -$3.34 and Élodie -$3.33. |
| Amount boundaries | Negative, NaN, Infinity, unsafe-cent amount and zero all disable submission. Invalid values have aria-invalid; zero is valid input but cannot create an expense. |
| Percentage split | $1.01 with 0.01%, 64.04% and 35.95% saves. This is the reproduced floating-point validation regression. |
| Exact split | $0.05 paid by selected Sam stores allocations 2, 2 and 1 cents. Negative exact input stays visible and disables save. Normal save returns focus to Description. |
| Share split | Fractional 1.5 shares is rejected with recovery guidance; 2, 1 and 1 shares on seven cents saves. |
| Itemized split | $2.00 assigned to Sam plus $1.00 unassigned produces a $3.00 expense. Only $2.00 enters balances; the pending dollar is visible. |
| Receipt upload | Uploaded a fictional 32 by 24 PNG, decoded and stored as a 767-byte JPEG. An SVG upload is rejected and the existing thumbnail remains. |
| Receipt edit cancellation | View opens the image; Tab stays on Close; Escape closes it. Removing the image in an edit then cancelling preserves the original expense reference and IndexedDB blob. Focus returns to Edit Itemized picnic. |
| Failed write and recovery | Injected QuotaExceededError only for the reconciliation key. Existing stored bytes stayed unchanged, the new expense stayed visible, and an alert warned to keep the tab open. Restored storage and Retry saving persisted it. Reload retained six expenses. |
| Concurrent tabs | Opened a same-context popup with window.open. Held the reconciliation Web Lock, queued edits from both windows, then released it. One persisted; the stale window kept its in-memory draft, disabled editing and showed the conflict. Prior expenses survived. Closed the popup. Separate preview_open incognito tabs are isolated contexts and were not used as cross-tab evidence. |
| Oversized draft recovery | Before the independent review fix, a 10,001-character description disappeared while the saved count stayed five. After the fix, it stays visible, shows the 10,000-character limit and disables submit. |
| PDF controls | Shift-Tab wraps to Download. Deselecting every section disables download. Double-click generated one PDF. Focus returns to Export PDF after completion. |
| PDF content | The downloaded two-page PDF has the expected expense and per-person totals, pending $1.00, Élodie text and page numbers. Parsed its text and inspected the first rendered page. Receipts are omitted. |
| Requests | Initial page, PDF modules and both TTF fonts are requested from the same loopback origin. No reconciliation data request, telemetry or remote font request observed. Blob downloads are local. |

## Final follow-up checks

| Workflow | Evidence |
| --- | --- |
| Mobile and untrusted names | A 360-character unbroken/script-like name originally expanded the page to 3,342 pixels at a 375-pixel viewport. After wrapping fixes, ordinary and itemized forms, balances and settlement stay at scrollWidth 375. Text is inert. |
| Themes | Light, dark and system modes work, including a system appearance change. |
| Group and payer changes | Switching between groups resets the draft and item mode. Removing the selected payer displays Alex as fallback and saves Alex as payer. |
| Member deletion | Removing Sam deletes Exact taxi, which he paid. His picnic item becomes pending. The two pending items total $3.00 and enter neither credit nor debt. |
| Group rename and deletion | Renaming persists. Cancelling group deletion keeps both groups and focus on Delete. Confirming deletion removes the empty household group and selects the remaining group. |
| Expense deletion | Deleting Mobile long name removes exactly one record and focuses the Expenses list. |
| Corrupt storage | Replaced the fictional record with malformed JSON, then schema version 99. Each reload preserves the exact supplied record, displays a recovery warning and leaves only Reload saved data enabled. Restored the fictional fixture afterward. |
| Long history | Seeded 1,000 fictional 101-cent equal expenses with alternating payers. All 1,000 rows render, survive another reload, and show the expected $5.00 settlement. No benchmark or maximum UI-history claim is made. Unit storage coverage separately round-trips 10,000 expenses. |
| Corrupt stored receipt | Replaced the fictional receipt blob with undecodable JPEG bytes. The viewer closes and returns focus; editing shows Receipt unavailable with removal available. Restored the 767-byte fixture blob afterward. |
| PDF cancellation and focus | Deferred both font requests, started export, confirmed focus on Cancel and disabled section controls, then pressed Escape. Releasing fonts caused no download. Focus returned to Export PDF. |
| Final PDF content | Downloaded a two-page report dated 2026-11-12. Current balances are Alex +$13.56, Élodie -$12.89 and the long-name person -$0.67. Pending items total $3.00. Parsed every page and inspected rendered pages. Person details and long names retain readable amount columns. The inspection prompted a section-heading fix. Its exact fixture failed before the fix and passes afterward; the final production export keeps the heading with Alex and his details on the same page. |
| Final requests and cleanup | Page resources, PDF chunks and both TTF fonts used only 127.0.0.1:43189. Closed all owned tabs and the same-context popup. Stopped the preview and confirmed no listener remains on 43189. |

Browser assertions cover accessibility semantics and keyboard behavior. No real screen reader, physical mobile device or universal browser matrix was available. Receipt-ID replacement and late URL revocation received source review; all async timing permutations were not exercised in-browser. The final section-heading spacing is verified by the PDF regression suite and a final production export.

## Round 1 native follow-up

A fresh incognito production-browser batch passed on 12 November 2026 after the
checkpoint. Vite listened only on 127.0.0.1:43189. The shared heavy lock was held
for the bounded related browser batch, then released before compiler checks.

- A 10,001-character person name was refused, its input retained and an alert
  exposed. Correction saved normally. An invalid rename survived actual blur;
  correction saved and returned focus to its rename button.
- Actual group prompts refused an oversized name, retained all 10,001 characters
  as the retry default, survived cancellation and accepted a corrected group.
  Preview status truncates the displayed default to 4,000 characters; a wrapper
  measured the original argument before invoking the unchanged native prompt.
- Holding native createImageBitmap completion blocked add submission and kept
  the draft. Releasing it decoded/reencoded the fictional image and persisted
  the expense with its receipt exactly once.
- Holding the application's native IndexedDB write-completion callback blocked
  edit submission. Release permitted the edit and persisted the replacement
  receipt. The transaction itself completed normally; this checks a delayed
  application completion, not delayed disk durability.
- A rejected decoder exposed recovery guidance and kept the expense draft. It
  could then be saved without a photo.
- Finishing an old group's upload could neither unblock the new group's pending
  upload nor replace its draft. The new group saved its own completed receipt.
- Reload retained expense counts 2, 1 and 0 across the three fictional groups.
  Both referenced receipts were native IndexedDB JPEG blobs of 759 bytes.

One initial write probe targeted the add form's file input while submitting the
edit form. Its failure was a fixture error. Root corrected the selector and
reran the edit sequence successfully; it is retained as such in external logs.
All owned tabs and the preview process were closed, and no listener remained
on port 43189. No tunnel, container, deployment or external data write was used.
