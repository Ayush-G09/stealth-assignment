# Agent Activity Explorer (app)

The Part A frontend: React 19, TypeScript and Vite. See the [root README](../README.md) for what it does, how
the pieces fit together and how to run the mock API.

```bash
npm install
npm run dev       # http://localhost:5173 (expects the mock API on http://localhost:4000)
npm test          # Vitest unit tests
npm run lint      # Oxlint
npm run build     # tsc -b && vite build
```

Configuration: `VITE_API_URL` overrides the API base URL (default `http://localhost:4000`).

The one place with logic worth unit-testing in isolation is the windowing math in
[`src/lib/virtual.ts`](src/lib/virtual.ts), covered by [`src/lib/virtual.test.ts`](src/lib/virtual.test.ts).
