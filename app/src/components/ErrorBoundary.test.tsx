// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

let shouldThrow = true
function Bomb() {
  if (shouldThrow) throw new Error('kaboom')
  return <p>all good</p>
}

afterEach(() => {
  cleanup()
  shouldThrow = true
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    shouldThrow = false
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByText('all good')).toBeTruthy()
  })

  it('shows a recovery screen with the message instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
    expect(screen.getByText('kaboom')).toBeTruthy()
  })

  it('logs the error so it is not swallowed', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(log.mock.calls.some((c) => String(c[0]).includes('Unhandled UI error'))).toBe(true)
  })

  it('"Try again" re-renders the children once the cause is gone', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    shouldThrow = false
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('all good')).toBeTruthy()
  })
})
