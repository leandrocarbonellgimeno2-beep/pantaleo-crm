import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,

  // 100% de errores server-side (gratuito — solo cuenta transacciones de perf)
  tracesSampleRate: 0.05,
});
