# Perf Clinic: findings and fixes

Page: `perf-clinic/` (plain HTML/CSS/JS, 100k generated events, 200 rendered rows, 24 agent cards).

## How the numbers were measured

Every "before" number comes from the **original starter code served on a second port** (commit `27133e3`),
and every "after" number from the fixed code, using the **same measurement script, same browser, same
1480x900 viewport, same session**. Timings use `performance.now()` around the page's own functions
(`search`, `renderResults`, `fitSummaries`, the scroll handler, ...) and the Resource/Navigation Timing APIs for
load and transfer size.

Caveats, so nobody over-reads the table:
- Absolute milliseconds are noisy on this machine (the same call varied up to ~5x between runs), so read the
  **ratios**, not the digits. Where I re-ran something I report the paired run.
- I did **not** use DevTools Performance/Lighthouse screenshots for this write-up; I found the problems by
  reading the source and timing the suspect functions. A DevTools trace would be the natural next step to
  confirm the main-thread picture, and I would add one before sending this in.
- Every fix was checked for **behavioural equivalence** against the original algorithm where practical
  (same search results for several queries, same focused rows and counts while scrolling, same "New" badges).

## Summary (original -> fixed)

| Metric | Before | After |
|---|---|---|
| Transfer on load | 6,477 KB, 19 requests | 402 KB, 6 requests |
| DOMContentLoaded | 1,085 ms | 240 ms |
| `renderResults('')` (what every keystroke triggers) | 6,385 ms | 58 ms |
| Fit result summaries | 2,982 ms | 12 ms |
| Search, first call | 3,643 ms | 44 ms |
| Search, repeat call | 429 ms | 41 ms |
| Scroll handler, per event | 384 ms | 13 ms first call, ~0.3 ms after (and max once per frame) |
| Hover preview, per mouse move | 12.1 ms | ~0 ms |
| Ticker intervals leaked after 5 open/close | 5 | 0 |

---

### 1. Forced layout in `fitSummaries` froze the page on every render
- **Symptom:** Typing in the search box (and the initial load) locked the page for seconds.
- **How I found it:** Reading `renderResults` -> `fitSummaries`, then timing it: ~3 s for 200 rows, the biggest single cost inside `renderResults`.
- **Root cause:** For each of 200 cells the loop writes `style.fontSize` and immediately reads `scrollWidth`/`clientWidth`, up to 6 times per cell. Each read after a write forces a synchronous layout, so about 1,000+ full layouts per render (layout thrashing).
- **Fix:** All summaries share one grid track width, so I read it once and measure each text on a canvas (`measureText`), computing the size directly. Layout happens once. It re-runs when the web font finishes loading, because metrics change then, and keeps a 1px safety margin.
- **Before / after:** 2,982 ms -> 12 ms. Output matched the original DOM-measured sizes on 197 of 200 rows at a viewport where sizes vary; the other 3 differ by 0.5px.

### 2. Every keystroke re-scanned and re-sorted all 100k events
- **Symptom:** Search input lag; results appeared hundreds of ms to seconds after typing.
- **How I found it:** Timing `search()`: 3.6 s cold, 430 ms repeat for a query.
- **Root cause:** `search` ran `JSON.stringify(event).toLowerCase()` for all 100k events on every keystroke, then sorted the matches with `new Date(...)` constructed inside the comparator. Nothing was cached, and there was no debounce, so fast typing queued full scans.
- **Fix:** Sort once (numeric timestamp keys), build a lowercase haystack array aligned to that order once (warmed in `requestIdleCallback` after first paint), then just `includes()` per keystroke. Input is debounced 150 ms.
- **Before / after:** repeat search 429 ms -> 41 ms; first search 3,643 ms -> 44 ms. Results identical to the original for 5 test queries (including empty and whitespace-padded).

### 3. Scroll handler did layout thrash and a 100k scan per event
- **Symptom:** Scrolling the results list was janky and dropped frames.
- **How I found it:** Timing the handler at 384 ms per call (budget is ~16 ms).
- **Root cause:** On every scroll event it (a) removed `in-focus` from all 200 rows then read `getBoundingClientRect()` on each (a forced layout per row), (b) ran `ACTIVITY.filter(... new Date(...).toISOString() ...)` over all 100k events to count calls in the focused minute, and (c) changed the sticky header's `padding-block`, which reflows the whole page.
- **Fix:** Throttle to one run per `requestAnimationFrame`, make the listener passive, do all reads before writes, only touch classes when the focused set actually changes, precompute minute counts once in a `Map`, and drop the per-scroll header padding resize (the header no longer shrinks as you scroll; that is the one visible tradeoff).
- **Before / after:** 384 ms -> 13 ms for the first call (builds the minute map) and ~0.3 ms afterwards. Focused rows and the "N calls that minute" text matched the original at three scroll positions.

### 4. 6.4 MB of images for a 48px avatar and one hero
- **Symptom:** Slow first load, especially on slower connections.
- **How I found it:** Resource Timing / file sizes: `hero.png` was 4.2 MB (1700x950 PNG); each of 12 avatars was a 160 KB 320x320 PNG shown at 48px, and files 07-12 were byte-identical duplicates of 01-06 (checked with md5).
- **Root cause:** Unoptimised, oversized assets; duplicates; no `width`/`height` (layout shift), no lazy loading.
- **Fix:** Converted to WebP (hero 1700w + 850w `srcset`, avatars 96x96), kept 6 unique avatars (index `% 6`), added `width`/`height`, `loading="lazy"` and `decoding="async"` on avatars, and `fetchpriority="high"` on the hero.
- **Before / after:** hero 4.2 MB -> 324 KB (18 KB for the small variant); 12 x 160 KB avatars -> 6 x ~0.4 KB. Total transfer 6,477 KB -> ~720 KB at this step.

### 5. 327 KB render-blocking stylesheet with zero used rules
- **Symptom:** Slower first paint; the browser can't render until every stylesheet in `<head>` is downloaded and parsed.
- **How I found it:** `css/theme.css` was by far the largest text asset. I extracted its 1,436 class names and checked them against `index.html`, `app.js` and `app.css`.
- **Root cause:** A utility-class library ("Atlas UI") that the page never uses: 0 of 1,436 classes referenced.
- **Fix:** Removed the `<link>` and the file.
- **Before / after:** -327 KB on the critical path; total transfer ~720 KB -> 402 KB with the later steps.

### 6. Blocking scripts and generation of 100k events before first paint
- **Symptom:** Blank page for about a second on load.
- **How I found it:** `config.js` is a synchronous `<script>` in `<head>` that builds 100k events (~115 ms in isolation), followed by the main script; DOMContentLoaded was 1,085 ms.
- **Root cause:** Parser-blocking scripts, and the web font had no preload or `font-display` (invisible text while it loads).
- **Fix:** `defer` on both scripts (order is preserved), `<link rel="preload">` for the font, and `font-display: swap`.
- **Before / after:** DOMContentLoaded 1,085 ms -> 240 ms (together with 4 and 5).

### 7. Live ticker leaked an interval and listeners on every open
- **Symptom:** After toggling "Show live calls" a few times, the page got steadily busier even with the ticker closed.
- **How I found it:** Wrapped `setInterval`/`clearInterval` and toggled 5 times: 5 started, 0 cleared. `resize` and `keydown` listeners were also re-added on each open and never removed.
- **Root cause:** `openTicker` created a new interval and listeners each time; `closeTicker` removed only the DOM node. A row cache (`renderedTickerRows`) also grew without bound.
- **Fix:** Store the timer, clear it and remove both listeners in `closeTicker`, guard against double-open, and drop the cache (rows are tiny to build).
- **Before / after:** leaked intervals after 5 cycles: 5 -> 0; listeners added/removed now balance (12/12).

### 8. "Viewed" bookkeeping wrote localStorage 200 times per render
- **Symptom:** Part of the render stall.
- **How I found it:** Counting `Storage.prototype.setItem` calls with a user who had already viewed 5,000 events.
- **Root cause:** `rememberViewed` called `localStorage.setItem(JSON.stringify(viewed))` inside the per-item loop, serialising a growing array each time, and the "New" check used `Array.includes` on that unbounded list.
- **Fix:** Keep ids in a `Set`, read storage once, write once per render and only when something changed.
- **Before / after:** 120 ms and 200 writes per render -> 0.4 ms and 1 write (0 when nothing is new).

### 9. Smaller hot spots
- **`formatTime`** called `toLocaleTimeString` per row (builds a formatter each time): replaced with `iso.slice(11, 19)`, which is identical for UTC ISO strings (verified on 3,000 events). About 47 ms per render saved.
- **Agent card heights** were equalised in JS with O(n^2) `offsetTop`/`offsetHeight` reads, re-run on every image load and resize (70 ms per call): replaced with CSS grid stretch plus `min-height: 220px`. Same visual result (equal heights per row, minimum 220px).
- **Hover preview** did `ACTIVITY.find` over 100k events on every mouse move (12.1 ms): it now reads the text from the row (~0 ms).
- **Alerts strip** animated `left` (layout every frame): now animates `transform` using container-relative units over the same path (checked at 0, 9 s, 18 s). Also disabled under `prefers-reduced-motion`. I did not measure this one; it is a standard layout-versus-compositor fix.

## Not changed / ideas

- `scripts/serve-perf-clinic.js` sends no `Cache-Control` and no compression. It is outside `perf-clinic/`, so I left it, but caching and gzip/brotli would help repeat loads.
- Only 200 rows are rendered, so I did not add virtualization here.
- The 100k-event dataset is generated in the browser at load. In a real app it would come from the server and be paginated.
