import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'
import './index.css'
import App from './App.tsx'

// ── Sentry crash reporting (native iOS + React) ─────────────────────────────
// @sentry/capacitor handles native iOS crashes/ANRs.
// Passing SentryReact.init as the second arg wires up the React/browser layer
// at the same time — official dual-SDK pattern for Capacitor apps.
Sentry.init(
  {
    dsn: 'https://9b9dc39826aee7d605695f9b89d8a46b@o4511250909429760.ingest.us.sentry.io/4511250921750528',
    environment: import.meta.env.MODE, // 'production' | 'development'
    tracesSampleRate: 0,               // no perf traces — keeps free tier clean
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    initialScope: { tags: { app: 'zerog-pwa' } },
  },
  SentryReact.init,
);

// Brutal cache-busting: immediately unregister any old service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (let registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ErrorBoundary catches React render errors and sends them to Sentry */}
    <SentryReact.ErrorBoundary fallback={<p style={{ padding: 24, color: '#fff' }}>Something went wrong. Please restart ZeroG.</p>}>
      <App />
    </SentryReact.ErrorBoundary>
  </StrictMode>,
)
