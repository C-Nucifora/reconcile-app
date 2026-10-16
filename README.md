# Reconcile

[![CI](https://github.com/C-Nucifora/reconcile-app/actions/workflows/ci.yml/badge.svg)](https://github.com/C-Nucifora/reconcile-app/actions/workflows/ci.yml)

A browser app for splitting group expenses and working out who owes whom.
Enter expenses, choose how to divide them, and get net balances and a settlement plan.
Calculations and data storage run in your browser, without an account or backend.

## Features

- Separate groups for trips, households and other shared costs.
- Equal, exact-amount, percentage and share-based splits.
- Itemized expenses with per-item assignments and optional receipt photos.
- Net balances and a deterministic settlement plan that matches the largest debts
  against the largest credits. This greedy algorithm does not guarantee the fewest
  possible transfers.
- Integer-cent calculations with deterministic rounding.
- PDF reports with settlement, expense and per-person sections.
- Light, dark and system themes.

## Getting started

Use Node.js 20, 22 or 24, matching the CI matrix, with npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`;
the static site is written to `dist/`. Use `npm run preview` to inspect that build.

## Data and privacy

Group names, people and expenses are stored in this browser's `localStorage`.
Receipt images are stored separately in IndexedDB. The app does not upload these
records or sync them between devices. The site host still receives normal page
requests when you load the app.

Clearing site data or using a different browser, profile or site origin makes the
saved records unavailable. Treat exported PDF reports as personal financial data;
only share the sections you intend to disclose. A PDF report is not a restorable
backup of your browser data.

Use fictional names, expenses and receipts in issues, screenshots and test fixtures.
Keep real exports, receipts and local configuration outside the repository. Root
`exports/`, `receipts/` and `.local-data/` folders are ignored for local testing.

## Development

React and TypeScript with Vite, Tailwind CSS and Vitest.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Type-check and build the static site. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run the unit tests once. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run test:coverage` | Run tests with coverage. |

The [CI workflow](.github/workflows/ci.yml) runs lint, type-checking, tests with
coverage and a build on Node.js 20, 22 and 24 for pushes and pull requests to `main`.

The calculation engine is in `src/engine/`, browser state and validation in
`src/state/`, receipt storage in `src/lib/imageStore.ts`, PDF generation in
`src/export/`, and the interface in `src/components/`. Design notes are in `docs/`.
