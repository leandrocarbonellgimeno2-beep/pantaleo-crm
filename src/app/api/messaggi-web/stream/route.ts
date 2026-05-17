import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = db.collection('messaggi_web')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
          const messaggi = snapshot.docs.map(doc => {
            const data = doc.data();
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
          
          // Sort in memory in case some don't have timestamp and use fallback
          messaggi.sort((a: any, b: any) => {
            const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || a.createdAt || 0);
            const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || b.createdAt || 0);
            return db.getTime() - da.getTime();
          });

          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(messaggi)}\n\n`));
        }, (error) => {
          console.error("Firebase Snapshot Error:", error);
          controller.error(error);
        });

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
