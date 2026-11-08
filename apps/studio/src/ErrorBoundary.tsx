import { Component, type ReactNode } from 'react';

/** Catches a crash while drawing one screen so the rest of the studio stays usable. `key` it by route to reset on navigation. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Screen crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center" role="alert">
        <h2>This screen hit an error</h2>
        <p className="sub">{this.state.error.message || 'Something went wrong while drawing it.'}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
          <a className="btn secondary" href="#/" onClick={() => this.setState({ error: null })}>Go to Home</a>
        </div>
      </div>
    );
  }
}

export function NotFound({ path }: { path: string }) {
  return (
    <div className="center">
      <h2>Page not found</h2>
      <p className="sub">There is no screen at <code>{path}</code>.</p>
      <div style={{ marginTop: 20 }}><a className="btn primary" href="#/">Go to Home</a></div>
    </div>
  );
}
