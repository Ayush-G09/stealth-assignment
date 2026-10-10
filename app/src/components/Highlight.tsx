import { memo } from 'react'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Wraps case-insensitive matches of `query` in <mark>. Renders plain text when there is no query. */
export const Highlight = memo(function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, 'ig'))
  if (parts.length === 1) return <>{text}</>
  const needle = q.toLowerCase()
  return (
    <>
      {parts.map((part, i) => (part.toLowerCase() === needle ? <mark key={i}>{part}</mark> : part))}
    </>
  )
})
