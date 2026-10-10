// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { parse, serialize, type UrlState } from './useUrlState'

const empty: UrlState = { q: '', agents: [], status: '', eventId: null }
const state = (patch: Partial<UrlState>): UrlState => ({ ...empty, ...patch })

beforeEach(() => {
  history.replaceState(null, '', '/')
})

describe('parse', () => {
  it('returns empty defaults for an empty query string', () => {
    expect(parse('')).toEqual(empty)
    expect(parse('?')).toEqual(empty)
  })

  it('reads every field', () => {
    expect(parse('?q=stripe&agent=billing-assistant&status=error&event=evt_1')).toEqual({
      q: 'stripe',
      agents: ['billing-assistant'],
      status: 'error',
      eventId: 'evt_1',
    })
  })

  it('works with or without the leading "?"', () => {
    expect(parse('q=x')).toEqual(parse('?q=x'))
  })

  it('collects repeated agent params in order', () => {
    expect(parse('?agent=b&agent=a&agent=c').agents).toEqual(['b', 'a', 'c'])
  })

  it.each(['ok', 'blocked', 'error'])('accepts status "%s"', (status) => {
    expect(parse(`?status=${status}`).status).toBe(status)
  })

  it.each(['bogus', 'OK', 'Error', '1', ' ok'])('drops an invalid or differently-cased status: "%s"', (status) => {
    expect(parse(`?status=${encodeURIComponent(status)}`).status).toBe('')
  })

  it('decodes percent-escapes, plus signs and unicode', () => {
    expect(parse('?q=a%20b').q).toBe('a b')
    expect(parse('?q=a+b').q).toBe('a b')
    expect(parse('?q=%26%3D%23').q).toBe('&=#')
    expect(parse('?q=caf%C3%A9%20%F0%9F%9A%80').q).toBe('café 🚀')
  })

  it('ignores unknown params', () => {
    expect(parse('?utm_source=x&foo=bar&q=ok')).toEqual(state({ q: 'ok' }))
  })

  it('takes the first value when a single-valued param is repeated', () => {
    expect(parse('?q=first&q=second').q).toBe('first')
    expect(parse('?status=ok&status=error').status).toBe('ok')
  })

  it('treats empty values as absent', () => {
    const s = parse('?q=&status=&event=')
    expect(s.q).toBe('')
    expect(s.status).toBe('')
    expect(s.eventId).toBeFalsy() // callers only test for truthiness
  })

  it('does not throw on malformed percent-encoding', () => {
    expect(() => parse('?q=%E0%A4%A')).not.toThrow()
  })

})

describe('serialize', () => {
  it('falls back to the current path when there is nothing to put in the query', () => {
    history.replaceState(null, '', '/explorer')
    expect(serialize(empty)).toBe('/explorer')
  })

  it('emits params in a stable order: q, agent(s), status, event', () => {
    const s = state({ eventId: 'evt_1', status: 'error', agents: ['b', 'a'], q: 'x' })
    expect(serialize(s)).toBe('?q=x&agent=b&agent=a&status=error&event=evt_1')
  })

  it('omits empty fields', () => {
    expect(serialize(state({ q: 'only' }))).toBe('?q=only')
    expect(serialize(state({ status: 'ok' }))).toBe('?status=ok')
    expect(serialize(state({ eventId: 'e' }))).toBe('?event=e')
  })

  it('encodes reserved characters so the value survives the round trip', () => {
    const out = serialize(state({ q: 'a&b=c#d e' }))
    expect(out).not.toContain('#')
    expect(out).not.toMatch(/&b=/)
    expect(new URLSearchParams(out).get('q')).toBe('a&b=c#d e')
  })

  it('keeps repeated agents as repeated params', () => {
    expect(serialize(state({ agents: ['a', 'b'] }))).toBe('?agent=a&agent=b')
  })
})

describe('parse(serialize(x)) round trip', () => {
  const samples: [string, UrlState][] = [
    ['empty', empty],
    ['search only', state({ q: 'stripe' })],
    [
      'everything',
      state({ q: 'refund', agents: ['billing-assistant', 'data-analyst'], status: 'blocked', eventId: 'evt_01M4G8' }),
    ],
    ['reserved characters', state({ q: 'a&b=c#d?e/f\\g', agents: ['we ird&name='] })],
    ['unicode and emoji', state({ q: 'café 🚀 日本語' })],
    ['leading/trailing spaces are preserved', state({ q: '  padded  ' })],
    ['percent and plus signs', state({ q: '100% + more' })],
    ['quotes', state({ q: `"double" and 'single'` })],
    ['event id with unusual characters', state({ eventId: 'evt/with space?and#chars' })],
  ]

  it.each(samples)('is lossless: %s', (_label, s) => {
    expect(parse(serialize(s))).toEqual(s)
  })

  it.each(samples)('is stable: serializing the parsed result gives the same URL (%s)', (_label, s) => {
    const once = serialize(s)
    expect(serialize(parse(once))).toBe(once)
  })

  it('canonicalises parameter order without losing anything', () => {
    const scrambled = '?event=e&status=ok&agent=b&agent=a&q=x'
    expect(serialize(parse(scrambled))).toBe('?q=x&agent=b&agent=a&status=ok&event=e')
  })
})
