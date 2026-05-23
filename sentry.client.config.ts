import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Solo activo si el DSN está configurado (sin DSN = no-op silencioso)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 5% de transacciones — conserva la cuota gratuita (10k/mes)
  tracesSampleRate: 0.05,

  // Sin Session Replay — demasiado pesado para el bundle
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,

  // Ignora errores de red/extensiones del browser que no son del CRM
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    /^ChunkLoadError/,
    /chrome-extension/,
  ],
});
