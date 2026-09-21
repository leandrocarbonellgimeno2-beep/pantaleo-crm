/**
 * /api/proxy-image — Proxy server-side para immagini Firebase Storage
 * ─────────────────────────────────────────────────────────────────────────────
 * Perché esiste:
 *   Firebase Storage blocca le richieste fetch() client-side da domini esterni
 *   (CORS policy). Il server di Vercel NON è soggetto a CORS — può scaricare
 *   qualsiasi URL e restituirla al client come buffer binario.
 *
 * Sicurezza:
 *   - Whitelist dei domini accettati (solo Firebase/GCS)
 *   - Nessun SSRF possibile su IP locali o domini arbitrari
 *   - Whitelist dei Content-Type: si servono SOLO immagini, mai HTML
 *   - Cache pubblica 1h per ridurre le richieste ripetute
 *
 * Uso:
 *   GET /api/proxy-image?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2F...
 *   → restituisce il buffer dell'immagine con Content-Type corretto
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { normalizeImageContentType } from '@/lib/image-content-type';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
];

export async function GET(request: Request) {
  // Lectura, pero con guard: sin el, bloquear a alguien no le cortaba el
  // acceso a los datos. Un ex-empleado con la pestaña abierta seguia listando
  // clientes y descargando documentos durante las ocho horas que le quedaran
  // de sesion, porque ningun GET de negocio pasaba por aqui. «agente» es el
  // nivel mas bajo, asi que ningun rol pierde acceso: lo que se gana es que el
  // bloqueo y la degradacion surtan efecto de verdad.
  const denegado = await guard(request, 'agente');
  if (denegado) return denegado;
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    // ── Validazione anti-SSRF ────────────────────────────────────────────────
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const isAllowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    if (!isAllowed) {
      return NextResponse.json({ error: `Host not allowed: ${parsed.hostname}` }, { status: 403 });
    }

    // ── Fetch server-side (nessun limite CORS) ───────────────────────────────
    const upstream = await fetch(rawUrl, {
      headers: { 'User-Agent': 'Pantaleo-CRM-PDF-Generator/1.0' },
      signal: AbortSignal.timeout(15_000), // 15s timeout
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status} ${upstream.statusText}` },
        { status: 502 },
      );
    }

    // ── Validazione del Content-Type ─────────────────────────────────────────
    // Prima si copiava quello della sorgente tal quale. Un file caricato su
    // Storage come text/html veniva quindi servito come HTML DAL DOMINIO DEL
    // CRM: XSS di same-origin. Si valida PRIMA di leggere il corpo, cosi una
    // risposta non valida non passa nemmeno per la memoria della lambda.
    const contentType = normalizeImageContentType(upstream.headers.get('content-type'));

    if (!contentType) {
      const visto = upstream.headers.get('content-type') || '(assente)';
      console.warn(`[proxy-image] Content-Type rifiutato: "${visto}" per ${parsed.pathname}`);
      return NextResponse.json(
        { error: 'Tipo di contenuto non consentito' },
        { status: 415 },
      );
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Content-Length': String(buffer.byteLength),

        // Difesa in profondita: anche se un tipo consentito venisse usato per
        // servire altro, il browser non deve indovinare il formato ne
        // eseguire nulla aprendo direttamente questa URL.
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline',
      },
    });

  } catch (err: any) {
    console.error('[proxy-image] Error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
