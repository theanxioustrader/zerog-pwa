import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'

// ── Sentry crash reporting ──────────────────────────────────────────────────
Sentry.init({
  dsn: 'https://9b9dc39826aee7d605695f9b89d8a46b@o4511250909429760.ingest.us.sentry.io/4511250921750528',
  environment: import.meta.env.MODE, // 'production' | 'development'
  // Capture 100% of errors, no performance traces (keeps free tier usage low)
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Tag every event with the app name so it's easy to filter
  initialScope: { tags: { app: 'zerog-pwa' } },
});

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
    <App />
  </StrictMode>,
)
