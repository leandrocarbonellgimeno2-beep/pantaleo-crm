/**
 * Redimensionado y compresión de imágenes en el navegador, antes de subirlas.
 * Limita el lado mayor a 1920 px y reencoda a WebP con calidad 0.82.
 *
 * Solo funciona en cliente: usa FileReader, Image y canvas.
 */
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 0.82;

export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = String(event.target?.result);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No ctx');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject('Blob error')),
          'image/webp',
          WEBP_QUALITY,
        );
      };
      img.onerror = () => reject('Image load error');
    };
    reader.onerror = () => reject('File read error');
  });
}
