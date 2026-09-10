# Visual overhaul

Implement in the visual-overhaul worktree using the existing React and Tailwind stack.

- [x] Replace the page shell with a group sidebar, workspace header, summary, expense ledger, and balances column.
- [x] Define pale blue, cobalt, and navy theme tokens, serif display typography, shared controls, and responsive layouts.
- [x] Move expense creation into an accessible native dialog. Keep existing split, itemization, receipt, and export functionality.
- [x] Restyle people, balance, settlement, receipt, and export views consistently. Key group content by group ID to reset stale forms when switching groups.
- [x] Run lint, tests, and production build. Review light and dark themes in Safari, including empty and populated states and narrow layout.

Keep the calculation engine and persistence format unchanged. Use existing money functions for totals. No remote fonts or image dependencies. Preserve system theme preference and reduced motion. Leave changes for review on the worktree branch.

## Verification

All 72 tests pass, including two settlement display regressions. TypeScript and the production build pass. ESLint completes with no errors and eight existing warnings about hook dependencies and Fast Refresh exports. Vite reports the existing large PDF renderer chunk.

Safari checks covered group creation, adding three participants, a 126.50 expense split into 42.17, 42.17, and 42.16, editing, percentage and itemized controls, Escape cancellation, reload persistence, light and dark themes, and the 390 by 844 responsive layout. Export downloaded a PDF successfully. Receipt image loading was preserved in the shared dialog but not exercised with an uploaded image.

Review corrected the settlement panel to keep allocated transfers visible when receipt items remain pending, with a provisional warning.

The final palette uses blue accents in both themes.
