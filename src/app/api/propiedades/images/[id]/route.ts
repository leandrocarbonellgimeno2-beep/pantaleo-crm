import { admin } from "@/lib/firebase-admin";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split('/').pop();

    if (!id) {
       return new Response(JSON.stringify({ error: "No id provided" }), { status: 400 });
    }

    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = admin.storage().bucket(storageBucket);
    
    const prefVenta = `propiedades/Fotos_Venta/${id}_`;
    const prefAlquiler = `propiedades/Fotos_Alquiler/${id}_`;
    
    const [filesVenta] = await bucket.getFiles({ prefix: prefVenta });
    const [filesAlquiler] = await bucket.getFiles({ prefix: prefAlquiler });
    
    const allFiles = [...filesVenta, ...filesAlquiler];
    
    const urlsAndNames = await Promise.all(allFiles.map(async (file) => {
        const [url] = await file.getSignedUrl({
             action: 'read',
             expires: '01-01-2099'
        });
        return { name: file.name, url };
    }));
    
    // Sort naturally by (FotoX)
    urlsAndNames.sort((a,b) => {
       const extractNum = (str: string) => {
           const match = str.match(/Foto(\d+)/);
           return match ? parseInt(match[1]) : 0;
       }
       return extractNum(a.name) - extractNum(b.name);
    });

    return new Response(JSON.stringify({ urls: urlsAndNames.map(x => x.url) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
