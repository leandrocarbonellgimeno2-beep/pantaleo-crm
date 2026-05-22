// ═══════════════════════════════════════════════════════════════
// IDEALISTA — OAuth2 Token Manager
// Handles Client Credentials flow with in-memory caching
// ═══════════════════════════════════════════════════════════════

import { IDEALISTA_CONFIG, IdealistaToken } from '@/types/idealista';

let cachedToken: IdealistaToken | null = null;

function getBaseUrl(): string {
  // Legge dall'env var a runtime (non dalla costante hardcoded)
  const useSandbox = process.env.IDEALISTA_USE_SANDBOX === 'true';
  return useSandbox
    ? IDEALISTA_CONFIG.SANDBOX_BASE_URL   // https://partners-sandbox.idealista.it
    : IDEALISTA_CONFIG.PRODUCTION_BASE_URL;
}

function isTokenValid(): boolean {
  if (!cachedToken) return false;
  const elapsed = Date.now() - cachedToken.fetchedAt;
  // Refresh 60s before expiry to avoid race conditions
  return elapsed < (cachedToken.expires_in - 60) * 1000;
}

/**
 * Obtains a valid Bearer token, using cache when possible.
 * Uses OAuth2 Client Credentials Grant.
 */
export async function getIdealistaToken(): Promise<string> {
  if (isTokenValid() && cachedToken) {
    return cachedToken.access_token;
  }

  const clientId     = process.env.IDEALISTA_CLIENT_ID     || IDEALISTA_CONFIG.CLIENT_ID;
  const clientSecret = process.env.IDEALISTA_CLIENT_SECRET;
  if (!clientSecret) throw new Error('IDEALISTA_CLIENT_SECRET env var is not set');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${getBaseUrl()}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Idealista OAuth failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    fetchedAt: Date.now(),
  };

  return cachedToken.access_token;
}

/**
 * Makes an authenticated request to the Idealista API with exponential backoff.
 *
 * Retry policy:
 *  - Retry su errori di rete (fetch throw) e su 5xx (errori server transienti)
 *  - NON ritentare su 4xx (errori client permanenti)
 *  - Max 3 tentativi totali con backoff 500ms → 1500ms → 4500ms
 *  - Su 429 (rate limit) usa Retry-After se presente, altrimenti backoff standard
 */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

function shouldRetry(status: number): boolean {
  if (status === 429) return true;
  return status >= 500 && status < 600;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function idealistaFetch(
  path: string,
  options: RequestInit = {},
  customToken?: string
): Promise<Response> {
  const token = customToken || await getIdealistaToken();
  const baseUrl = getBaseUrl();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'feedKey': process.env.IDEALISTA_FEED_KEY || '',
    ...(options.headers as Record<string, string> || {}),
  };

  // Add Content-Type for requests with body
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

      if (res.ok || !shouldRetry(res.status)) return res;

      // Server error o rate limit → retry
      if (attempt < MAX_ATTEMPTS) {
        const retryAfter = res.headers.get('Retry-After');
        const backoff = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
          : BASE_BACKOFF_MS * Math.pow(3, attempt - 1);
        console.warn(`[Idealista] ${path} → HTTP ${res.status}, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      return res; // ultimo tentativo: ritorna la response anche se fallita
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        const backoff = BASE_BACKOFF_MS * Math.pow(3, attempt - 1);
        console.warn(`[Idealista] ${path} → network error "${err.message}", retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  // Unreachable in practice — il loop ritorna o lancia in ogni branch
  throw lastError || new Error('Idealista fetch failed after retries');
}

/**
 * Convenience: makes an authenticated request and returns JSON + status.
 */
export async function idealistaRequest<T = any>(
  path: string,
  options: RequestInit = {},
  customToken?: string
): Promise<{ status: number; data: T; ok: boolean }> {
  const res = await idealistaFetch(path, options, customToken);
  
  let data: any;
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, ok: res.ok };
}
