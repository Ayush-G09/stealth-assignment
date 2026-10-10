import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEvent, type EventDetail } from '../lib/api'

interface Props {
  id: string
  onClose: () => void
}

const SLOW_MS = 3000

export function DetailPanel({ id, onClose }: Props) {
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const opener = useRef<Element | null>(document.activeElement)

  // fetch; abort when id changes or panel closes so a slow earlier event can't overwrite a newer one
  useEffect(() => {
    const c = new AbortController()
    setEvent(null); setError(null); setSlow(false)
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    fetchEvent(id, c.signal)
      .then((e) => { clearTimeout(t); setSlow(false); setEvent(e) })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        clearTimeout(t); setSlow(false)
        setError(e instanceof Error && e.message.includes('404') ? 'This event no longer exists.' : e.message)
      })
    return () => { c.abort(); clearTimeout(t) }
  }, [id, attempt])

  // Esc closes; focus moves in on open and back to the row on close
  const close = useCallback(() => {
    onClose()
    requestAnimationFrame(() => (opener.current as HTMLElement | null)?.focus?.())
  }, [onClose])

  useEffect(() => {
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <aside className="panel" role="dialog" aria-label="Event details">
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
            <p>Couldn't load this event: {error}</p>
            <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          </div>
        )}
        {event && (
          <>
            <dl>
              <dt>ID</dt><dd><code>{event.id}</code></dd>
              <dt>Time</dt><dd>{new Date(event.timestamp).toLocaleString()}</dd>
              <dt>Agent</dt><dd>{event.agent}</dd>
              <dt>Tool</dt><dd><code>{event.tool}</code></dd>
              <dt>Status</dt><dd><span className={`badge ${event.status}`}>{event.status}</span></dd>
              <dt>Latency</dt><dd>{event.latencyMs} ms</dd>
              <dt>Policy matches</dt>
              <dd>{event.policyMatches?.length ? event.policyMatches.join(', ') : <span className="muted">none</span>}</dd>
            </dl>
            <h3>Args</h3>
            <Json value={event.args} />
            <h3>Result</h3>
            <Json value={event.result} />
          </>
        )}
      </div>
    </aside>
  )
}

const MAX_CHARS = 20000

/** Args can be huge, so cap what we render until the user asks for everything. */
function Json({ value }: { value: unknown }) {
  const [all, setAll] = useState(false)
  const text = JSON.stringify(value, null, 2) ?? 'null'
  const clipped = !all && text.length > MAX_CHARS
  return (
    <>
      <pre tabIndex={0}>{clipped ? text.slice(0, MAX_CHARS) + '\n…' : text}</pre>
      {clipped && (
        <button onClick={() => setAll(true)}>Show all ({(text.length / 1024).toFixed(0)} KB)</button>
      )}
    </>
  )
}
