import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'

// Dev-mode safety: PWA service workers cache aggressively and can serve stale
// bundles long after a rebuild. On localhost, proactively unregister any SW and
// purge caches so reloads always hit the dev server fresh.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => {
    if (rs.length > 0) {
      Promise.all(rs.map(r => r.unregister()))
        .then(() => caches?.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))))
        .then(() => location.reload())
    }
  }).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
