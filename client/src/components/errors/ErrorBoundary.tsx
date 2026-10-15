import { Component, type ErrorInfo, type ReactNode } from 'react'
import { normalizeError, reportError } from '../../lib/errorReporter'
import { ErrorFallback } from './ErrorFallback'

interface Props {
  children: ReactNode
  variant?: 'page' | 'app'
  /** When any of these values change (e.g. the URL), the boundary resets itself. */
  resetKeys?: unknown[]
}

interface State {
  error: Error | null
  errorId: string | null
  componentStack: string | null
}

const initialState: State = { error: null, errorId: null, componentStack: null }

/**
 * Catches errors thrown while rendering its children, reports them to the server
 * and shows <ErrorFallback> instead of a blank screen.
 *
 *   <ErrorBoundary variant="page" resetKeys={[pathname]}> <Outlet /> </ErrorBoundary>
 *
 * Note: errors in event handlers / async code are not render errors — those are
 * caught by installGlobalErrorHandlers() and by the API error handling instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = initialState

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: normalizeError(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const errorId = reportError({ error, source: 'boundary', componentStack: info.componentStack })
    this.setState({ errorId, componentStack: info.componentStack ?? null })
  }

  componentDidUpdate(prevProps: Props) {
    const changed = (prevProps.resetKeys ?? []).some((key, i) => !Object.is(key, this.props.resetKeys?.[i]))
    if (this.state.error && changed) this.reset()
  }

  reset = () => this.setState(initialState)

  render() {
    const { error, errorId, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <ErrorFallback
        error={error}
        errorId={errorId}
        componentStack={componentStack}
        variant={this.props.variant}
        onRetry={this.reset}
      />
    )
  }
}
