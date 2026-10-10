# Notes

## What I built, and why

**Part A** (`app/`, React 19 + TypeScript + **Vite**). I chose Vite over Next.js because this is a client-only app over a separate
API: there is no server rendering or routing for Next to add, and Vite keeps the setup small.

- **Core:** a virtualized table over all 50,000 events (cursor paging driven by scroll), search plus agent, status and time-range
  filters held in the URL (refresh, back/forward and shared links restore the view), a detail panel at `?event=<id>` that closes with
  Esc, and loading / empty / error / slow states wherever data loads.
- **Polish (all five):** keyboard navigation, tablet layout, accessibility (axe-core: 0 violations on the main views), themes,
  and `prefers-reduced-motion`.
- **Stretch:** (1) the **hand-built virtualized list**, no library; (2) the **events-over-time chart** from `/events/histogram` with
  drag-to-zoom (ECharts; the brief only excludes virtualization libraries); (3) **tests**, 196 in all. Virtualization because 50k rows
  demands it, the chart because "when did this happen" is the first question about this data, tests to guard what breaks quietly
  (URL state, retry/abort, stale responses).
- **Extras:** filter chips, copy buttons, an error boundary, stale-while-revalidate for the list and chart.

**Part B:** nine problems found and fixed, with measurements, in [`PERF.md`](PERF.md).

## Tradeoffs and what I'd do with more time

- Fixed 40px rows make windowing O(1), but long values are truncated, not wrapped.
- URL state uses query params (`?event=`) with no router library; path-based event URLs would be nicer to share.
- The chart is canvas, so I added a text summary and a keyboard-operable date-time form as the accessible alternative.
- Retries cover 5xx and network errors only; a 429 is not retried.
- More time: a DevTools trace for Part B, Playwright tests for the drag interaction, CI, and a purpose-built phone layout.

## Known gaps

- **Not verified:** Firefox and Safari, touch dragging on a real phone, a real screen reader, and the copy-to-clipboard success path.
- `PERF.md` timings come from the browser's Performance API and are noisy on this machine (read the ratios). I did not use the DevTools profiler.
- At tablet width the Arguments column is hidden, so an arguments-only search match shows no visible reason.
- Phones work, but the page chrome leaves the table little room.

## How I used AI tools

I used **Claude Code (Anthropic) as a development assistant** throughout the project to accelerate implementation, explore technical approaches, and assist with testing and debugging.

**My contribution:** I drove the technical approach and development process, from prioritizing requirements and choosing the architecture to defining feature behavior and validating the application. I chose Vite for the client-only architecture, guided the implementation of virtualization for 50,000 events, and integrated ECharts for time-series analysis. I also made the key UX and accessibility decisions by running the application and evaluating its behavior.

I used AI assistance to accelerate coding, investigate issues, and expand test coverage. I reviewed changes, checked behavior against the requirements, and decided what to retain, revise, or defer. The final tradeoffs and documented gaps reflect my assessment of the implementation.

I prioritized the core requirements first, followed by performance improvements and stretch features. I also identified areas for further validation, including cross-browser testing, real-device touch interactions, and automated coverage for chart interactions.

My focus was on delivering a functional application while making deliberate tradeoffs around performance, accessibility, usability, and maintainability, using AI to work more efficiently.
