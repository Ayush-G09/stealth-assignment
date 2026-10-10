const { pageSize, tickerIntervalMs, tickerVisibleRows, storageKey } = window.APP_CONFIG;

const grid = document.getElementById('agents');
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const topbar = document.querySelector('.topbar');
const backToTop = document.getElementById('back-to-top');
const progress = document.getElementById('read-progress');
const tickerToggle = document.getElementById('ticker-toggle');
const preview = document.getElementById('row-preview');
const scrollContext = document.getElementById('scroll-context');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  // ISO timestamps are UTC, so HH:MM:SS is a slice (toLocaleTimeString builds a formatter per call).
  return iso.slice(11, 19);
}

function countByAgent(events) {
  const counts = {};
  events.forEach((event) => {
    counts[event.agent] = (counts[event.agent] || 0) + 1;
  });
  return counts;
}

function renderAgents() {
  const counts = countByAgent(window.ACTIVITY);
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    const image = 'assets/agents/agent-' + String((index % 6) + 1).padStart(2, '0') + '.webp';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" width="48" height="48" loading="lazy" decoding="async" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">' + (counts[agent.name] || 0).toLocaleString() + ' calls today</p>' +
      '</article>'
    );
  }).join('');
}

// Viewed ids live in a Set (O(1) lookups) that is read from storage once and written back once per render.
let viewed = null;

function loadViewed() {
  if (!viewed) viewed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  return viewed;
}

function rememberViewed(items) {
  const seen = loadViewed();
  const before = seen.size;
  for (const item of items) seen.add(item.id);
  if (seen.size !== before) localStorage.setItem(storageKey, JSON.stringify([...seen]));
}

// Newest-first order and per-event search text are computed once, not on every keystroke.
// `haystacks[i]` is the lowercased JSON of `sortedEvents[i]`.
let sortedEvents = null;
let haystacks = null;

function sortEvents() {
  if (!sortedEvents) {
    sortedEvents = window.ACTIVITY
      .map((event) => ({ event, ts: Date.parse(event.timestamp) }))
      .sort((a, b) => b.ts - a.ts)
      .map((entry) => entry.event);
  }
  return sortedEvents;
}

function buildHaystacks() {
  if (!haystacks) haystacks = sortEvents().map((event) => JSON.stringify(event).toLowerCase());
  return haystacks;
}

function search(query) {
  const needle = query.trim().toLowerCase();
  const events = sortEvents();
  if (!needle) return events;
  const texts = buildHaystacks();
  const matches = [];
  for (let i = 0; i < events.length; i++) {
    if (texts[i].includes(needle)) matches.push(events[i]);
  }
  return matches;
}

function renderResults(query) {
  const matches = search(query);
  const page = matches.slice(0, pageSize);
  const seen = loadViewed();
  const isNewFlags = page.map((event) => !seen.has(event.id));
  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  resultsList.innerHTML = page.map((event, i) => {
    const isNew = isNewFlags[i];
    return (
      '<li class="result-row status-' + event.status + '" data-id="' + event.id + '" data-minute="' + event.timestamp.slice(11, 16) + '">' +
      '<span class="result-time">' + formatTime(event.timestamp) + '</span>' +
      '<span class="result-agent">' + escapeHtml(event.agent) + '</span>' +
      '<span class="result-tool">' + escapeHtml(event.tool) + '</span>' +
      '<span class="result-status">' + event.status + '</span>' +
      '<span class="result-latency">' + event.latencyMs + ' ms</span>' +
      '<span class="result-summary">' + escapeHtml(event.summary) + '</span>' +
      (isNew ? '<span class="badge-new">New</span>' : '') +
      '</li>'
    );
  }).join('');
  fitSummaries();
  rememberViewed(page);
}

// Shrink overflowing summaries (14px down to 11px). Every summary sits in the same grid track, so
// the width is read from the DOM once and text widths are measured on a canvas. That avoids a
// forced layout per cell (the old write-font-size / read-scrollWidth loop).
const measureCtx = document.createElement('canvas').getContext('2d');

function fitSummaries() {
  const cells = resultsList.querySelectorAll('.result-summary');
  if (!cells.length) return;
  const available = cells[0].clientWidth;
  measureCtx.font = '14px ' + getComputedStyle(cells[0]).fontFamily;
  const sizes = Array.from(cells, (cell) => {
    const width = measureCtx.measureText(cell.textContent).width;
    let size = 14;
    while (size > 11 && (width * size) / 14 > available - 1) size -= 0.5;
    return size;
  });
  cells.forEach((cell, i) => { cell.style.fontSize = sizes[i] + 'px'; });
}

// Calls per UTC minute, counted once (the old handler re-scanned all 100k events on every scroll event).
let minuteCounts = null;

function callsInMinute(minute) {
  if (!minuteCounts) {
    minuteCounts = new Map();
    for (const event of window.ACTIVITY) {
      const key = event.timestamp.slice(11, 16);
      minuteCounts.set(key, (minuteCounts.get(key) || 0) + 1);
    }
  }
  return minuteCounts.get(minute) || 0;
}

let focusedRows = [];
let scrollFrame = 0;

// Runs at most once per frame. All layout reads happen before any write.
function updateOnScroll() {
  scrollFrame = 0;
  const scrolled = window.scrollY;
  const viewport = window.innerHeight;
  const max = document.documentElement.scrollHeight - viewport;

  const rows = resultsList.children;
  const focused = [];
  for (const row of rows) {
    const top = row.getBoundingClientRect().top;
    if (top > viewport * 0.3 && top < viewport * 0.6) focused.push(row);
  }

  progress.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  backToTop.classList.toggle('visible', scrolled > viewport);

  if (focused.length !== focusedRows.length || focused.some((row, i) => row !== focusedRows[i])) {
    focusedRows.forEach((row) => row.classList.remove('in-focus'));
    focused.forEach((row) => row.classList.add('in-focus'));
    focusedRows = focused;
    const minute = focused.length ? focused[0].dataset.minute : null;
    scrollContext.textContent = minute ? minute + ' UTC · ' + callsInMinute(minute) + ' calls that minute' : '';
  }
}

function onScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateOnScroll);
}

function hidePreview() {
  preview.hidden = true;
}

function showPreview(event) {
  const row = event.target.closest('.result-row');
  if (!row) return;
  // The row already holds the summary, no need to search 100k events for it.
  preview.textContent = row.querySelector('.result-summary').textContent;
  preview.style.top = event.clientY + 12 + 'px';
  preview.style.left = event.clientX + 12 + 'px';
  preview.hidden = false;
}

let tickerPanel = null;
let tickerTimer = 0;

function tickerRow(event) {
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';
  return row;
}

function positionTicker() {
  if (!tickerPanel) return;
  tickerPanel.style.maxHeight = window.innerHeight - 120 + 'px';
}

function onTickerKeydown(event) {
  if (event.key === 'Escape') closeTicker();
}

function openTicker() {
  if (tickerPanel) return;
  const panel = document.createElement('aside');
  panel.className = 'ticker';
  panel.innerHTML = '<header class="ticker-header">Live tool calls</header><ul class="ticker-list"></ul>';
  document.body.appendChild(panel);
  tickerPanel = panel;
  const list = panel.querySelector('.ticker-list');

  tickerTimer = setInterval(() => {
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  window.addEventListener('resize', positionTicker);
  window.addEventListener('keydown', onTickerKeydown);
  positionTicker();
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function closeTicker() {
  if (!tickerPanel) return;
  clearInterval(tickerTimer);
  window.removeEventListener('resize', positionTicker);
  window.removeEventListener('keydown', onTickerKeydown);
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderResults(searchInput.value), 150);
});
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', fitSummaries);
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview);
resultsList.addEventListener('touchstart', hidePreview);
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();
renderResults('');

// Warm the search index after first paint so the first keystroke is not the slow one.
(window.requestIdleCallback || setTimeout)(buildHaystacks);

// Text metrics change once the web font arrives, so fit again then.
document.fonts.ready.then(fitSummaries);
