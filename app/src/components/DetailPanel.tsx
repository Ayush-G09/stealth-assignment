import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchEvent, type EventDetail } from '../lib/api'

interface Props {
  id: string
  onClose: () => void
}

const SLOW_MS = 3000

export function DetailPanel({ id, onClose }: Props) {
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(document.activeElement)

  // Fetch; abort on unmount/retry so a slow earlier request can't overwrite a newer one.
  // App keys this component by event id, so a new id remounts it with fresh state.
  useEffect(() => {
    const c = new AbortController()
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    fetchEvent(id, c.signal)
      .then((e) => { clearTimeout(t); setSlow(false); setEvent(e) })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        clearTimeout(t); setSlow(false)
        const missing = e instanceof ApiError && e.status === 404
        setNotFound(missing)
        setError(missing ? 'This event no longer exists.' : e.message)
      })
    return () => { c.abort(); clearTimeout(t) }
  }, [id, attempt])

  const retry = () => {
    setError(null)
    setNotFound(false)
    setSlow(false)
    setAttempt((n) => n + 1)
  }

  // Esc closes; focus moves in on open and back to the row on close
  const close = useCallback(() => {
    onClose()
    requestAnimationFrame(() => (opener.current as HTMLElement | null)?.focus?.())
  }, [onClose])

  useEffect(() => {
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close()
      if (e.key !== 'Tab') return
      // Focus trap: the page behind is blurred and blocked, so Tab must cycle inside the panel.
      const focusables = panel.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const inside = panel.current?.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <>
    <div className="backdrop" onClick={close} aria-hidden="true" />
    <div ref={panel} className="panel" role="dialog" aria-modal="true" aria-label="Event details">
      <div className="panel-head">
        <h2>Event details</h2>
        <button ref={closeBtn} onClick={close} aria-label="Close details (Esc)">✕</button>
      </div>
      <div className="panel-body" aria-live="polite">
        {!event && !error && (
          <p className="muted">{slow ? 'Still loading, this is slower than usual…' : 'Loading event…'}</p>
        )}
        {error && (
          <div role="alert">
            <p>{notFound ? error : `Couldn't load this event: ${error}`}</p>
            {notFound
              ? <button onClick={close}>Close</button> // retrying a missing event can't succeed
              : <button onClick={retry}>Try again</button>}
          </div>
        )}
        {event && (
          <>
            <dl>
              <dt>ID</dt><dd><code>{event.id}</code> <CopyButton text={event.id} label="Copy event ID" /></dd>
              <dt>Time</dt><dd>{new Date(event.timestamp).toLocaleString()}</dd>
              <dt>Agent</dt><dd>{event.agent}</dd>
              <dt>Tool</dt><dd><code>{event.tool}</code></dd>
              <dt>Status</dt><dd><span className={`badge ${event.status}`}>{event.status}</span></dd>
              <dt>Latency</dt><dd>{event.latencyMs} ms</dd>
              <dt>Policy matches</dt>
              <dd>
                {event.policyMatches?.length
                  ? event.policyMatches.map((m) => <span key={m} className="tag">{m}</span>)
                  : <span className="muted">none</span>}
              </dd>
            </dl>
            <h3>Args</h3>
            <Json value={event.args} label="Copy args" />
            <h3>Result</h3>
            <Json value={event.result} label="Copy result" />
          </>
        )}
      </div>
    </div>
    </>
  )
}

const MAX_CHARS = 20000

/** Args can be huge, so cap what we render until the user asks for everything. */
function Json({ value, label }: { value: unknown; label: string }) {
  const [all, setAll] = useState(false)
  const text = JSON.stringify(value, null, 2) ?? 'null'
  const clipped = !all && text.length > MAX_CHARS
  return (
    <>
      <pre tabIndex={0}>{clipped ? text.slice(0, MAX_CHARS) + '\n…' : text}</pre>
      <div className="json-actions">
        {clipped && <button onClick={() => setAll(true)}>Show all ({(text.length / 1024).toFixed(0)} KB)</button>}
        <CopyButton text={text} label={label} />
      </div>
    </>
  )
}

/** Copies the full text (never the clipped preview). Clipboard can be unavailable or denied, so report failure. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 1800)
  }
  return (
    <button className="copy" onClick={copy} aria-label={label}>
      {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  )
}
