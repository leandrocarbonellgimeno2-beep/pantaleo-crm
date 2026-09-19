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
 *  - Max 3 tentativi totali con backoff 500ms → 1500ms → 4500ms
 *  - NON ritentare su 4xx (errori client permanenti)
 *  - Su 429 (rate limit) usa Retry-After se presente, altrimenti backoff standard
 *  - I 5xx e gli errori di rete si ritentano SOLO sui metodi idempotenti:
 *    vedi la nota qui sotto, e la ragione per cui si duplicavano annunci.
 */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

/**
 * Metodi che si possono ripetere senza creare niente due volte.
 *
 * POST non e qui, ed e il punto di tutto questo. Su /v1/properties e
 * /v1/contacts un POST CREA un annuncio o un contatto: ripeterlo crea un
 * duplicato. PUT e DELETE invece descrivono uno stato finale, ripeterli
 * porta allo stesso risultato.
 */
const METODI_IDEMPOTENTI = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

export function isIdempotentMethod(method: string | undefined): boolean {
  return METODI_IDEMPOTENTI.has((method || 'GET').toUpperCase());
}

/**
 * Decide se una risposta fallita si puo ritentare.
 *
 * 429 si ritenta SEMPRE, anche su POST: un rate limit significa che il
 * server ha RIFIUTATO la richiesta senza elaborarla, quindi non ha creato
 * niente e ripeterla e sicuro.
 *
 * 5xx su POST NON si ritenta, ed e la correzione. Un 502 o un 504 arrivano
 * da un gateway e possono benissimo significare che il backend HA elaborato
 * la richiesta e si e persa solo la risposta. Ritentare li raddoppiava
 * annunci e contatti a pagamento.
 */
export function shouldRetryStatus(status: number, idempotente: boolean): boolean {
  if (status === 429) return true;
  return idempotente && status >= 500 && status < 600;
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

  const idempotente = isIdempotentMethod(options.method as string | undefined);

  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

      if (res.ok || !shouldRetryStatus(res.status, idempotente)) {
        if (!res.ok && !idempotente && res.status >= 500) {
          console.warn(
            `[Idealista] ${path} → HTTP ${res.status} su metodo non idempotente: ` +
            'NON si ritenta, la richiesta potrebbe essere gia stata elaborata',
          );
        }
        return res;
      }

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
      // Un errore di rete su POST e il caso piu insidioso: la richiesta puo
      // essere arrivata e aver creato l annuncio senza che noi abbiamo mai
      // visto la risposta. Ritentare qui era la fonte principale dei
      // duplicati. Meglio un errore visibile che un annuncio pagato due volte.
      if (attempt < MAX_ATTEMPTS && idempotente) {
        const backoff = BASE_BACKOFF_MS * Math.pow(3, attempt - 1);
        console.warn(`[Idealista] ${path} → network error "${err.message}", retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      if (!idempotente) {
        console.warn(
          `[Idealista] ${path} → network error "${err.message}" su metodo non ` +
          'idempotente: NON si ritenta',
        );
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
