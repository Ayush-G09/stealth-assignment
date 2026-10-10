import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence: a render bug anywhere below shows a recovery screen instead of a blank page.
 * "Try again" re-renders the same view; "Start over" reloads with a clean URL, which also escapes a crash caused by
 * the URL itself (state lives in the query string).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p className="muted">
          The page hit an unexpected error. "Try again" re-renders the same view; "Start over" reloads with no filters.
        </p>
        <pre>{this.state.error.message}</pre>
        <div className="crash-actions">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button onClick={() => window.location.assign(window.location.pathname)}>Start over</button>
        </div>
      </div>
    )
  }
}
