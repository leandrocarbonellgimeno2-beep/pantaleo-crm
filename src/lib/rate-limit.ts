/**
 * Rate-limiter in-memory per processo Node. Usa una Map<key, bucket> con TTL.
 * Adatto a Vercel Fluid: la stessa istanza serializza più richieste sequenziali,
 * il che è esattamente il caso d'uso che vogliamo proteggere (brute-force su
 * /api/auth/login da un singolo IP). NON è distribuito tra istanze, ma per
 * uno scenario small-team in production è sufficiente. Se in futuro serve
 * un limit globale → migrare a Upstash Ratelimit.
 */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
}

const buckets = new Map<string, Bucket>();

// Pulizia opportunistica delle voci scadute — evita di tenere bucket vecchi
// in memoria all'infinito. Eseguita all'inizio di ogni hit invece di con
// setInterval (più affidabile in ambiente serverless dove i timer non
// sopravvivono tra invocazioni).
function sweepExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export interface RateLimitOptions {
  /** Numero massimo di richieste consentite nella finestra. */
  max: number;
  /** Durata della finestra in millisecondi. */
  windowMs: number;
  /** Identificativo (es. "login:1.2.3.4" o "backup:utente@x.com"). */
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Quanti tentativi restano nella finestra corrente. */
  remaining: number;
  /** Tra quanti secondi si resetta il counter. */
  retryAfterSec: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const b = buckets.get(opts.key);
  if (!b || b.resetAt < now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.max - 1, retryAfterSec: 0 };
  }

  b.count++;
  if (b.count > opts.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    };
  }
  return {
    allowed: true,
    remaining: opts.max - b.count,
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}

/** Estrae l'IP client da una Request Next.js. Vercel imposta x-forwarded-for. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
