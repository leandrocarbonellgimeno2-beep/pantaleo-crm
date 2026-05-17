import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

export const revalidate = 300; // Cache at Vercel edge for 5 minutes

export async function GET() {
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
    const filePath = path.join(process.cwd(), 'codigos_actuales.txt');
    fs.writeFileSync(filePath, content, 'utf-8');

    return NextResponse.json({
      status: '✅ Archivo creado',
      path: filePath,
      totalCodigos: codigos.length,
      preview: codigos.slice(0, 20).join(', ') + '...',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
