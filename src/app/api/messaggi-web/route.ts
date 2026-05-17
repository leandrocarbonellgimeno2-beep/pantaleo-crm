import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const snapshot = await db.collection('messaggi_web').orderBy('timestamp', 'desc').get();
    
    const messaggi = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Intentar formatear correctamente la fecha
      let createdAtValue = data.timestamp || data.createdAt;
      
      if (createdAtValue) {
        if (typeof createdAtValue.toDate === 'function') {
           createdAtValue = createdAtValue.toDate().toISOString();
        } else if (createdAtValue._seconds) {
           createdAtValue = new Date(createdAtValue._seconds * 1000).toISOString();
        }
      }

      return {
        id: doc.id,
        ...data,
        createdAt: createdAtValue
      };
    });

    return NextResponse.json(messaggi);
  } catch (error) {
    console.error("Error fetching messaggi_web:", error);
    
    // Si la coleccion o indice falla por orderBy createdAt, intentamos un simple GET como fallback
    try {
      const snapshotFallback = await db.collection('messaggi_web').get();
      const messaggi = snapshotFallback.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort in memory
      messaggi.sort((a: any, b: any) => {
        const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || a.createdAt || 0);
        const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || b.createdAt || 0);
        return db.getTime() - da.getTime();
      });
      return NextResponse.json(messaggi);
    } catch (fallbackError) {
      return NextResponse.json({ error: 'Errore interno nel server' }, { status: 500 });
    }
  }
}
