/**
 * /api/files — sirve ficheros privados de Storage exigiendo sesion.
 *
 * Esta ruta no existia, y su ausencia era lo que bloqueaba el arreglo: el plan
 * hablaba de "mandar los documentos privados tras el proxy autenticado", pero
 * /api/proxy-image NO es eso. Aquel hace fetch(url) sin credenciales del Admin
 * SDK y funciona solo porque el token hace publica la URL: quitarle el token a
 * un documento y seguir sirviendolo por ahi daria un 403.
 *
 * Aqui el fichero se lee con el Admin SDK, que no necesita token ni depende de
 * storage.rules, y la unica barrera es la cookie de sesion que ya exige el
 * middleware para todo lo que no sea /login ni /api/auth.
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { admin } from '@/lib/firebase-admin';
import { sanitizeStoragePath } from '@/lib/sanitize';
import { normalizeImageContentType } from '@/lib/image-content-type';

export const dynamic = 'force-dynamic';

// Lo que se puede servir tal cual. Coincide con lo que acepta /api/upload.
// Cualquier otra cosa se entrega como descarga opaca en vez de rechazarse: un
// fichero antiguo con un contentType raro tiene que poder recuperarse, pero
// nunca renderizarse como documento.
function tipoServible(raw: string | null | undefined): { tipo: string; inline: boolean } {
  const imagen = normalizeImageContentType(raw);
  if (imagen) return { tipo: imagen, inline: true };
  if ((raw || '').split(';')[0].trim().toLowerCase() === 'application/pdf') {
    return { tipo: 'application/pdf', inline: true };
  }
  return { tipo: 'application/octet-stream', inline: false };
}

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
    const rawPath = searchParams.get('path');

    if (!rawPath) {
      return NextResponse.json({ error: 'Path mancante' }, { status: 400 });
    }

    let path: string;
    try {
      // Mismo saneador que la subida: bloquea traversal, caracteres de control
      // y cualquier prefijo fuera de la allowlist.
      path = sanitizeStoragePath(rawPath);
    } catch (e: any) {
      console.warn('[files] path rejected:', rawPath, '→', e.message);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const storageBucket =
      process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const file = admin.storage().bucket(storageBucket).file(path);

    const [existe] = await file.exists();
    if (!existe) {
      return NextResponse.json({ error: 'File non trovato' }, { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const { tipo, inline } = tipoServible(metadata.contentType);
    const [buffer] = await file.download();

    const nombre = path.split('/').pop() || 'file';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': tipo,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nombre.replace(/"/g, '')}"`,
        // Privado: no debe quedarse en ninguna cache compartida, solo en la del
        // navegador que tiene la sesion.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error: any) {
    console.error('[files GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
