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

  // Sin sourcemap upload si no hay auth token (evita fallos de build sin cuenta Sentry)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Sin telemetría de Sentry durante el build
  telemetry: false,
});
