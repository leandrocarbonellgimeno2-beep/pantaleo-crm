/**
 * Configuracion de Sentry en el NAVEGADOR.
 *
 * Este fichero se llamaba sentry.client.config.ts y no lo cargaba nadie.
 * instrumentation.ts solo registra las configuraciones de servidor y edge —
 * su funcion register() no se ejecuta en el navegador—, y en Next 15/16 el
 * punto de entrada del cliente es exactamente este nombre de fichero.
 *
 * Consecuencia de que faltara: Sentry.init() jamas corria en el navegador, asi
 * que las llamadas a captureException de src/app/error.tsx y global-error.tsx
 * eran un no-op aunque NEXT_PUBLIC_SENTRY_DSN estuviese configurado en Vercel.
 * Se comprobo sobre el build: ni tracesSampleRate ni replaysSessionSampleRate
 * ni NEXT_PUBLIC_SENTRY_DSN aparecian en ningun chunk de cliente.
 */
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

// Sin esto, Sentry no sabe cuando empieza una navegacion del App Router y las
// trazas de cliente quedan sin contexto de ruta.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
