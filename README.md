# Agent Activity Explorer

Frontend take-home: a fast explorer for AI-agent tool-call events (Part A) and a performance clinic (Part B).
The original brief is in [ASSIGNMENT.md](ASSIGNMENT.md).

| Deliverable | Where |
|---|---|
| **Part A**: Agent Activity Explorer (React + Vite + TypeScript) | [`app/`](app/) |
| **Part B**: Perf Clinic fixes and write-up | [`perf-clinic/`](perf-clinic/) and [`PERF.md`](PERF.md) |
| Notes: choices, tradeoffs, known gaps, AI usage | [`NOTES.md`](NOTES.md) |

## Run it

Requires Node 18+. Run each command in its own terminal from the repo root.

```bash
npm run api            # mock API on http://localhost:4000 (picks the right binary for your OS)
```

```bash
cd app && npm install && npm run dev      # Part A on http://localhost:5173
```

```bash
npm run perf-clinic    # Part B on http://localhost:5174
```

The app talks to `http://localhost:4000` by default. To point it elsewhere, set `VITE_API_URL` (for example
`VITE_API_URL=http://localhost:4100 npm run dev`).

Other app scripts (run inside `app/`):

```bash
npm test         # unit tests (Vitest)
npm run lint     # Oxlint
npm run format   # Prettier (config in the repo root); `format:check` to verify without writing
npm run build    # type-check + production build
```

> The mock API ships as prebuilt binaries in `bin/`. On macOS you may need
> `xattr -d com.apple.quarantine bin/*` the first time.

## What Part A does

- **Event list** of all ~50,000 events, loaded page by page from the cursor API as you scroll. The list is a
  **hand-written virtualized table** (no library): only the rows in view, plus a small buffer, are in the DOM.
- **Search and filters** (free text, agents, status). Everything lives in the URL, so refresh, back/forward and
  copied links all restore the same view. Active filters show as removable chips.
- **Detail panel** at `?event=<id>`: full args, result and policy matches, with copy buttons. It is a modal dialog
  that closes with Esc or a click on the blurred background and returns focus to the list.
- **Loading, empty, error and slow-network states** for the list, "load more", the agents filter and the detail panel,
  with retry where retrying can help. Requests retry with backoff, and any request made stale by a newer filter is aborted.
- **Polish:** keyboard navigation (arrow keys, Page Up/Down, Home/End, Enter), tablet-width layout, System / Light / Dark
  theme switch, `prefers-reduced-motion` support, and an ARIA grid with correct row counts. axe-core reports no
  violations on the main views in either theme.

### Keyboard

| Key | In the list |
|---|---|
| Up / Down | Move the active row |
| Page Up / Page Down | Move by a screenful |
| Home / End | First / last loaded row |
| Enter or Space | Open the active row's details |
| Esc | Close the details panel |

## Layout

```
app/src/
  App.tsx                    page shell, wires URL state to data and UI
  lib/
    api.ts                   typed client: retry with backoff, abort support
    useUrlState.ts           filters + open event <-> URL (push/replace, back/forward)
    useEvents.ts             cursor pagination, stale-response protection, slow-network flag
    virtual.ts               pure windowing math (unit-tested)
    theme.ts                 System / Light / Dark persistence
  components/
    VirtualTable.tsx         the hand-built virtualized grid
    EventTable.tsx           loading / empty / error states around the grid
    FilterBar.tsx            search, status, agents, filter chips
    DetailPanel.tsx          modal event details
perf-clinic/                 Part B page (plain HTML/CSS/JS), fixed
PERF.md                      Part B findings, fixes and measurements
```
