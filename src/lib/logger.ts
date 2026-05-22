/**
 * Logger sottile con gate di produzione.
 *
 * - logger.debug(): solo in dev — visibile in console del browser / dev server.
 *   In prod (NODE_ENV === 'production') è un no-op, così non sporchiamo
 *   i Vercel Logs con noise e non leakiamo dati interni.
 * - logger.warn() e logger.error(): SEMPRE attivi, anche in prod — servono
 *   per debug operativo (rate limits, fetch falliti, retry, ecc).
 *
 * Usalo invece di console.* in tutto il nuovo codice. Il vecchio codice
 * viene migrato man mano.
 */

const isProd = process.env.NODE_ENV === 'production';

export const logger = {
  debug: (...args: unknown[]) => {
    if (!isProd) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProd) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
