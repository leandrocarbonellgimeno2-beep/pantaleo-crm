import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';
import { extractImageUrls } from '@/lib/imageUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    // Proyección a los campos que este informe usa de verdad. Antes traía los
    // documentos COMPLETOS: ~877 inmuebles con sus arrays de imágenes, textos y
    // documentación, para acabar leyendo tres cosas. Firestore cobra por
    // documento leído igual, pero el ancho de banda y la memoria de la función
    // caen muchísimo, que es lo que hacía lenta la descarga.
    const snapshot = await db.collection('immobili')
      .select(
        '_status',
        'GestioneCommerciale.Sospeso',
        'DatiBase.Codice',
        // Los seis campos donde pueden vivir las fotos, ver lib/imageUtils.
        'images', 'Media.Immagini', 'Immagini', 'DatiBase.Foto', 'Media.Urls', 'thumbnail',
      )
      .get();

    // Lista para almacenar inmuebles filtrados mapeados
    const mappedItems: { codeNum: number; visualCode: string }[] = [];

    // 2. Filtra e itera sobre los documentos
    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Nivel 0: fuera los que están en cola de borrado, como en todos los
      // demás listados. Antes salían en el informe como si siguieran activos.
      if (data._status === 'pendente_cancellazione') {
        continue;
      }

      // Nivel 1: Filtro de activas
      if (data.GestioneCommerciale?.Sospeso) {
        continue; // Ignorar suspendidas
      }

      // Nivel 2: filtro de sin imágenes. Se usa extractImageUrls y no
      // `data.images` a secas: había inmuebles migrados con las fotos solo en
      // campos legacy que salían en el informe "Urgente: faltan fotos"
      // teniéndolas.
      if (extractImageUrls(data).length > 0) {
        continue; // Ignorar si tiene imágenes
      }

      // 3. Mapeo
      const codeStr = data.DatiBase?.Codice || '';
      const codeNum = parseInt(codeStr) || 0;
      const visualCode = `Rif-${codeStr}-X`;

      mappedItems.push({ codeNum, visualCode });
    }

    // 4. Ordenamiento númerico (de menor a mayor)
    mappedItems.sort((a, b) => a.codeNum - b.codeNum);

    // 5. División en chunks de exactamente 5 elementos (5 columnas)
    const rows: string[] = [];
    let currentRow: string[] = [];
    
    for (let i = 0; i < mappedItems.length; i++) {
        currentRow.push(mappedItems[i].visualCode);
        
        // Cuando llegamos a 5 elementos, cerramos la fila
        if (currentRow.length === 5) {
            rows.push(currentRow.join(';'));
            currentRow = [];
        }
    }
    
    // Manejo de la última fila (si la lista no es múltiplo exacto de 5)
    if (currentRow.length > 0) {
        rows.push(currentRow.join(';'));
    }

    // 6. Conversión final con BOM \uFEFF y saltos de línea \n
    const csvContent = '\uFEFF' + rows.join('\n');

    // 7. Retorno con headers correctos
    return new NextResponse(csvContent, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="Urgente_Faltan_Fotos.csv"'
        }
    });

  } catch (error: any) {
    console.error("Error en exportación sin fotos:", error);
    return new NextResponse(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    });
  }
}
