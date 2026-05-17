import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtiene los documentos
    const snapshot = await db.collection('immobili').get();
    
    // Lista para almacenar inmuebles filtrados mapeados
    const mappedItems: { codeNum: number; visualCode: string }[] = [];

    // 2. Filtra e itera sobre los documentos
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Nivel 1: Filtro de activas
      if (data.GestioneCommerciale?.Sospeso) {
        continue; // Ignorar suspendidas
      }

      // Nivel 2: Filtro de sin imágenes (array inexistente o vacío)
      const hasImages = data.images && Array.isArray(data.images) && data.images.length > 0;
      if (hasImages) {
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
