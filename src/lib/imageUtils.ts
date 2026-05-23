/**
 * Image URL extraction shared between server and client code.
 *
 * Un documento immobile può avere URL foto in 5+ campi diversi a causa di
 * migrazioni storiche (DatiBase.Foto, Media.Immagini, Media.Urls, Immagini,
 * images, thumbnail). Questa funzione raccoglie tutto, deduplica, filtra
 * URL malformate e ritorna l'array canonico.
 *
 * Era duplicato in immobili/page.tsx (extractImages) e in due API routes
 * (purge-deleted, immobili GET). Ora vive in un solo posto.
 */

import type { Property } from '@/types/property';

export function extractImageUrls(doc: Partial<Property> & Record<string, any>): string[] {
  if (!doc || typeof doc !== 'object') return [];
  const candidates: string[] = [
    ...(Array.isArray(doc.images) ? doc.images : []),
    ...(Array.isArray(doc.Media?.Immagini) ? doc.Media!.Immagini! : []),
    ...(Array.isArray(doc.Immagini) ? doc.Immagini : []),
    ...(Array.isArray(doc.DatiBase?.Foto) ? doc.DatiBase!.Foto! : []),
    ...(Array.isArray(doc.Media?.Urls) ? doc.Media!.Urls! : []),
    ...(typeof doc.thumbnail === 'string' && doc.thumbnail ? [doc.thumbnail] : []),
  ];

  // Filter and dedup
  return [...new Set(
    candidates.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
  )];
}
