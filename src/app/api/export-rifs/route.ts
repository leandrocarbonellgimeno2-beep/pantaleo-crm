import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    // Only fetch the Codice field — 95% less data than full documents
    const snapshot = await db.collection('immobili').select('DatiBase.Codice').get();

    const codigos = snapshot.docs
      .map(doc => {
        const raw = doc.data().DatiBase?.Codice;
        return raw != null ? String(raw).trim() : null;
      })
      .filter((c): c is string => c !== null && c !== '')
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const content = codigos.join(', ');

    // Vercel's filesystem is read-only outside /tmp; writing to process.cwd()
    // previously threw EROFS in production. Return a direct download instead.
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="codigos_actuales.txt"',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
