import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * App-wide error boundary. Catches render-time errors anywhere in the tree
 * and shows a recoverable fallback UI instead of a blank white page.
 * Logs errors to the console so they're visible during development.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info.componentStack)
  }

  private handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: 480 }}>
          <div className="login-logo">B8N6 MAIL</div>
          <div className="login-tagline" style={{ color: 'var(--red)', marginBottom: 16 }}>
            <i className="bi bi-exclamation-triangle" /> Something went wrong
          </div>
          <div style={{
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: 11,
            color: 'var(--dim)',
            background: 'var(--bk3)',
            padding: '10px 12px',
            marginBottom: 16,
            maxHeight: 160,
            overflow: 'auto',
            border: '1px solid var(--bd)',
            wordBreak: 'break-word',
          }}>
            {this.state.error.message || 'Unknown error'}
          </div>
          <button className="btn-primary" onClick={this.handleReload} style={{ width: '100%', justifyContent: 'center' }}>
            <i className="bi bi-arrow-clockwise" /> Reload App
          </button>
        </div>
      </div>
    )
  }
}
