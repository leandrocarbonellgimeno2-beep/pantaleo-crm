import type { NextConfig } from "next";
import withBundleAnalyzerFactory from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const withBundleAnalyzer = withBundleAnalyzerFactory({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
};

const baseConfig = withBundleAnalyzer(nextConfig);

export default withSentryConfig(baseConfig, {
  // Silencia la salida verbose del webpack plugin de Sentry en el build log
  silent: true,

  // Solo sube sourcemaps si el token está configurado; sin token = skip silencioso
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // No bloquea el build si Sentry falla — CRM primero
  errorHandler(err) {
    console.warn('[Sentry build] non-fatal:', (err as Error).message);
  },

  // Evita añadir el SDK de Sentry al bundle si el DSN no está configurado.
  // Esto garantiza zero overhead en desarrollo local sin cuenta Sentry.
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableServerWebpackPlugin: !process.env.SENTRY_DSN,
});
