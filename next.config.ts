import type { NextConfig } from "next";
import withBundleAnalyzerFactory from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const withBundleAnalyzer = withBundleAnalyzerFactory({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

// ── Cabeceras de seguridad ───────────────────────────────────────────────────
//
// Los origenes de aqui NO salen de una plantilla: cada uno esta verificado
// contra el codigo de esta aplicacion. Una directiva a la que le falte un
// origen no da un aviso, da una pantalla rota.
const enDesarrollo = process.env.NODE_ENV === "development";

const directivasCSP = [
  "default-src 'self'",

  // Las tres que de verdad cortan ataques y no pueden romper nada de esta app:
  // impiden reescribir la base de las URLs relativas, cargar plugins, y que
  // alguien embeba el CRM en un iframe para hacer clickjacking.
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",

  // HONESTIDAD SOBRE ESTA LINEA: con unsafe-inline, script-src no protege
  // contra XSS. Es obligatorio hoy porque el App Router emite el payload RSC en
  // etiquetas <script> en linea SIN nonce (comprobado en el HTML generado: los
  // inline no llevan atributo nonce y el propio payload registra
  // "nonce":"$undefined"), y src/proxy.ts no genera ninguno. Sin
  // unsafe-inline la aplicacion no hidrata y queda en blanco.
  //
  // Lo que si aporta: bloquea cargar scripts de dominios externos. El arreglo
  // de verdad es generar un nonce por peticion en el proxy y entonces
  // QUITAR unsafe-inline; si se dejan los dos, el navegador ignora unsafe-inline
  // y rompe todo inline sin nonce. Es una tarea aparte, no un retoque de esta.
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,

  // unpkg: PropertyMap.tsx:117 inyecta en runtime un <link> a la hoja de estilos
  // de Leaflet desde unpkg.com. Sin este origen, el mapa sale sin estilar.
  // unsafe-inline: 56 props style={{}} en src/, el divIcon de Leaflet, y sonner
  // y framer-motion inyectando <style> en runtime sin soporte de nonce.
  "style-src 'self' 'unsafe-inline' https://unpkg.com",

  // Permisivo A PROPOSITO. Una imagen no ejecuta JavaScript, asi que restringir
  // este origen casi no aporta seguridad; en cambio, olvidarse un host rompe
  // fotos de verdad. En juego habia al menos seis: Firebase Storage, GCS,
  // lh3.googleusercontent.com, images.unsplash.com (el fondo del login),
  // *.tile.openstreetmap.org (los tiles del mapa) y unpkg (iconos de Leaflet).
  // data: y blob: hacen falta para las firmas en canvas y las
  // previsualizaciones de fotos y PDFs antes de subirlas.
  //
  // El XSS del proxy de imagenes NO se tapa aqui, se tapa en la propia ruta con
  // lista blanca de Content-Type y nosniff.
  "img-src 'self' data: blob: https:",

  "font-src 'self' data:",

  // Aqui si merece la pena ser estricto: connect-src es lo que impide que un
  // script exfiltre datos a un servidor ajeno.
  //   nominatim: geocodificacion de direcciones (PropertyMap.tsx:56 y :74).
  //   sentry:    ingesta de errores. Se cubren las tres regiones porque el host
  //              exacto depende del DSN, que vive en Vercel y no puedo leer.
  [
    "connect-src 'self'",
    "https://nominatim.openstreetmap.org",
    "https://*.ingest.sentry.io",
    "https://*.ingest.de.sentry.io",
    "https://*.ingest.us.sentry.io",
    enDesarrollo ? "ws://localhost:* http://localhost:*" : "",
  ].filter(Boolean).join(" "),

  // El unico iframe de la aplicacion: el mapa embebido de la ficha del
  // inmueble (PropertyEditForm.tsx:159). maps.google.com puede redirigir a
  // www.google.com, asi que van los dos.
  "frame-src https://maps.google.com https://www.google.com",

  // Los PDFs generados se abren como blob: (URL.createObjectURL).
  "worker-src 'self' blob:",
];

// En desarrollo rompe el servidor local, que va por http.
if (!enDesarrollo) directivasCSP.push('upgrade-insecure-requests');

const CSP = directivasCSP.join('; ');

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

  async headers() {
    return [
      {
        // Todas las rutas, incluidas las de /api.
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },

          // Impide que el navegador adivine el tipo de un fichero cuando el
          // Content-Type no le cuadra. Es la mitad del arreglo del XSS de
          // /api/proxy-image; la otra mitad va en la propia ruta.
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Redundante con frame-ancestors para navegadores modernos, pero
          // barato y cubre los que aun no lo soportan.
          { key: 'X-Frame-Options', value: 'DENY' },

          // Al salir del dominio se manda solo el origen, nunca la ruta
          // completa: las URLs del CRM llevan ids de inmuebles y clientes.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
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
