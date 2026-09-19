import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { sanitizeStoragePath } from "@/lib/sanitize";
import { esRutaPublica, extraerRutaDeUrl, urlPrivada } from "@/lib/storage-urls";

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawPath = formData.get("path") as string;

    if (!file || !rawPath) {
      return NextResponse.json({ error: "File or path missing" }, { status: 400 });
    }

    let path: string;
    try {
      path = sanitizeStoragePath(rawPath);
    } catch (e: any) {
      console.warn('[upload] path rejected:', rawPath, '→', e.message);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // Validate MIME type before reading into memory
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo file non consentito: ${file.type}. Sono accettati solo immagini (JPEG, PNG, WebP, GIF) e PDF.` },
        { status: 415 }
      );
    }

    // Validate file size before reading into memory
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File troppo grande. Dimensione massima consentita: 10 MB.' },
        { status: 413 }
      );
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    let contentType = file.type;

    // Server-side compression: only run if the file isn't already WebP (client
    // already compressed it) AND it exceeds the 500 KB size target.
    const MAX_SIZE_BYTES = 500 * 1024;
    const alreadyWebP = contentType === 'image/webp';

    if (!alreadyWebP && file.size > MAX_SIZE_BYTES && contentType.startsWith('image/')) {
      const sharp = require('sharp');

      buffer = await sharp(buffer)
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();

      contentType = 'image/webp';
      path = path.replace(/\.[^/.]+$/, '') + '.webp';
    }

    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = admin.storage().bucket(storageBucket);
    const storageFile = bucket.file(path);

    // El token firebaseStorageDownloadTokens convierte la URL en una
    // credencial portadora: publica, sin sesion, sin caducidad y saltandose
    // storage.rules. Antes se estampaba en TODOS los ficheros, contratos y
    // documentos de identidad incluidos.
    //
    // Ahora solo lo llevan las fotos de los anuncios, que tienen que seguir
    // siendo publicas porque Idealista las descarga sin cookie. Lo demas se
    // guarda sin token y se sirve por /api/files, que exige sesion.
    //
    // Ojo con el orden: `path` ya puede haberse reescrito a .webp mas arriba,
    // asi que la decision se toma sobre la ruta FINAL.
    const publica = esRutaPublica(path);
    const token = publica ? uuidv4() : null;

    await storageFile.save(buffer, {
      metadata: {
        contentType: contentType,
        ...(token ? { metadata: { firebaseStorageDownloadTokens: token } } : {}),
      },
    });

    const url = token
      ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storageFile.name)}?alt=media&token=${token}`
      : urlPrivada(path);

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("[upload POST]", error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL missing" }, { status: 400 });

    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;

    // Entiende las DOS formas de URL: la publica con token y la privada
    // /api/files?path=. Antes solo sabia leer la primera. Si se hubiera
    // quedado asi, los documentos nuevos no se podrian borrar nunca y se
    // quedarian en el bucket para siempre, ocupando y pagando, sin que nada
    // los referenciase.
    const rawFilePath = extraerRutaDeUrl(url, storageBucket);
    if (!rawFilePath) return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });

    let filePath: string;
    try {
      filePath = sanitizeStoragePath(rawFilePath);
    } catch (e: any) {
      console.warn('[upload DELETE] path rejected:', rawFilePath, '→', e.message);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const bucket = admin.storage().bucket(storageBucket);

    await bucket.file(filePath).delete();
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[upload DELETE]", error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
