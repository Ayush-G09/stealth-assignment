# Frontend Engineer Take-Home: Agent Activity Explorer

Thanks for taking the time to do this.

**Timeline:** due **Monday 12-10-2026, 10:00 AM**.
**Expected effort:** Core is about **5 hours**. Polish and Stretch are optional.

> We value a well-done Core over a rushed everything. If you only finish Core and it is solid, that is a strong submission.

---

## Getting started

```bash
git clone https://github.com/cm-nikesh/agent-activity-explorer.git
cd agent-activity-explorer
npm install
npm run api            # mock API on http://localhost:4000
npm run perf-clinic    # Part B page on http://localhost:5174
```

**Build Part A with React.** Two options, and you choose:

- **React with Vite:** `npm create vite@latest app -- --template react-ts`
- **Next.js (App Router):** `npx create-next-app@latest app`

Scaffold it into the `app/` folder and say in `NOTES.md` why you chose it. Apart from that you can use any libraries, with one exception noted under Stretch. TypeScript is strongly preferred.

The mock API sends CORS headers for any `localhost` origin, so you can call it directly from the browser.

The mock API ships as a prebuilt binary under `bin/`, and `npm run api` starts the right one for your platform. Treat the API as a third-party service you don't control. Please **clone with git** rather than downloading a zip; if macOS still blocks the binary, run `xattr -d com.apple.quarantine bin/*`.

Please **commit as you go and don't squash**. We read the history.

---

## The API

The mock API behaves like a real one: it is not always fast, and it does not always succeed.

### `GET /events`

Query params, all optional:

| Param | Description |
|---|---|
| `q` | Free-text search over agent, tool and args |
| `agent` | Filter by agent name (repeatable) |
| `status` | `ok` \| `blocked` \| `error` |
| `from`, `to` | ISO timestamps bounding the time range (inclusive `from`, exclusive `to`) |
| `cursor` | Opaque cursor from the previous page |
| `limit` | Page size, default 50, max 200 |

```json
{
  "items": [
    {
      "id": "evt_01J...",
      "timestamp": "2026-10-09T14:21:07.123Z",
      "agent": "billing-assistant",
      "tool": "http.request",
      "status": "ok",
      "latencyMs": 412,
      "argsPreview": "{\"url\": \"https://api.stripe.com/v1/...\"}"
    }
  ],
  "nextCursor": "eyJvZmZzZXQiOjUwfQ==",
  "total": 50213
}
```

### `GET /events/:id`

Returns the full event, including `args` (any JSON value, can be large), `result`, and `policyMatches` (an array of rule names that fired).

### `GET /agents`

Returns the list of agent names, for building filters.

### `GET /events/histogram`

Event counts per time bucket. It accepts the same `q`, `agent`, `status`, `from` and `to` params as `/events`, plus:

| Param | Description |
|---|---|
| `bucket` | `1m` \| `5m` \| `1h`, default `1m` |

```json
{
  "bucket": "1m",
  "buckets": [
    { "t": "2026-10-09T14:00:00Z", "count": 12 },
    { "t": "2026-10-09T14:02:00Z", "count": 31 }
  ]
}
```

Buckets with no events are omitted.

### `GET /stream` (Server-Sent Events, only needed for Stretch)

Emits new events as they happen, using the same shape as the list items.

---

## Part A: Agent Activity Explorer

### Core (required)

1. **Event list.** Show events in a table: timestamp, agent, tool, status, latency. The user must be able to get through the whole dataset, not just the first page.
2. **Search and filters.** Free-text search plus filters for agent and status. The current search and filters must survive a page refresh and work with the browser's back/forward buttons, and a copied URL must open the same view.
3. **Detail panel.** Clicking a row opens a side panel with the full event. The panel must be linkable by URL and closable by keyboard.
4. **States.** Every view that loads data must handle loading, empty, error and slow-network states in a way a real user would find clear.

### Polish (optional)

- Keyboard navigation through the list
- Responsive down to tablet width
- Accessibility: semantic markup, focus management, sufficient contrast
- Dark mode that follows the system setting
- Respects `prefers-reduced-motion`

### Stretch (optional)

**one done properly beats three done halfway**:

- **Live mode:** a toggle that shows new events from `/stream` as they arrive, without disrupting a user who is reading or has scrolled down the list.
- **Virtualized list, built by hand:** don't use a virtualization library for this one.
- **Events-over-time chart** using `/events/histogram`, reflecting the current search and filters. For bonus points, let the user select a time range on the chart to filter the list.
- **Tests** for the parts you think are most likely to break.

---

## Part B: Perf Clinic (about 1.5 hours)

Run `npm run perf-clinic` and open `http://localhost:5174`. This standalone page is plain HTML, CSS and JavaScript, with no framework, so the problems are about the browser itself. It works, but it is slow and janky.

Find and fix distinct performance problems in `perf-clinic/`. You may change anything in that folder, but keep it framework-free.

For each problem, add an entry to `PERF.md`:

```markdown
### 1. <Short name>
- **Symptom:** what the user experiences
- **How I found it:** which tool or DevTools panel you used (a screenshot is welcome)
- **Root cause:** why it happens, in your own words
- **Fix:** what you changed
- **Before / after:** a number (e.g. a metric, a timing or a memory figure)
```

Order the entries by impact on the user, highest first.

---

## Submission

Send us a link to your repo (public) containing:

1. Your code, with history intact
2. `PERF.md` for Part B
3. `NOTES.md`, one page at most, covering:
   - What you built, and which optional items you picked and why
   - Tradeoffs you made and what you would do differently with more time
   - Anything you know is broken or incomplete
   - **How you used AI tools**, if at all. Using them is fine, but please be specific.

---

## Questions

Email **nikesh@cleanmachines.ai**. We'll reply by Saturday.
