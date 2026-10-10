# Agent Activity Explorer (app)

The Part A frontend: React 19, TypeScript and Vite. See the [root README](../README.md) for what it does, how
the pieces fit together and how to run the mock API.

```bash
npm install
npm run dev       # http://localhost:5173 (expects the mock API on http://localhost:4000)
npm test          # Vitest unit tests
npm run lint      # Oxlint
npm run format    # Prettier (config lives in the repo root)
npm run build     # tsc -b && vite build
```

Configuration: `VITE_API_URL` overrides the API base URL (default `http://localhost:4000`).

Tests cover the logic most likely to break quietly:

- [`src/lib/virtual.test.ts`](src/lib/virtual.test.ts): the windowing math behind the virtualized table.
- [`src/lib/useEvents.test.tsx`](src/lib/useEvents.test.tsx): pagination, stale-response protection, keep-previous-rows
  while refreshing, error and retry paths.
- [`src/components/ErrorBoundary.test.tsx`](src/components/ErrorBoundary.test.tsx): the crash-recovery screen.
