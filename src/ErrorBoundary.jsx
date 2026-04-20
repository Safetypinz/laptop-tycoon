import { Component } from 'react'

const SAVE_KEY = 'lrt-v5'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[LRT] Render crashed:', error, info)
  }

  resetSave = () => {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {}
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-fallback">
          <div className="ef-box">
            <div className="ef-icon">⚠️</div>
            <div className="ef-title">Something broke</div>
            <div className="ef-msg">
              The game hit a render error. Your save may be from an older version
              or got corrupted. Resetting will start you fresh at Home Garage.
            </div>
            <pre className="ef-detail">{String(this.state.error?.message || this.state.error)}</pre>
            <div className="ef-btns">
              <button className="ef-reset" onClick={this.resetSave}>🗑️ Reset save &amp; reload</button>
              <button className="ef-reload" onClick={() => window.location.reload()}>🔄 Just reload</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
