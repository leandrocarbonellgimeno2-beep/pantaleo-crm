import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    let path = formData.get("path") as string;

    if (!file || !path) {
      return NextResponse.json({ error: "File or path missing" }, { status: 400 });
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

    const token = uuidv4();
    await storageFile.save(buffer, {
      metadata: {
        contentType: contentType,
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storageFile.name)}?alt=media&token=${token}`;

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

    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\/o\/(.+)$/);
    if (!match) return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });

    const filePath = decodeURIComponent(match[1]);
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = admin.storage().bucket(storageBucket);
    
    await bucket.file(filePath).delete();
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[upload DELETE]", error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
