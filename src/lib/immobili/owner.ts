/**
 * Accesor seguro para el nombre del propietario.
 *
 * Los documentos de proprietari conviven con dos convenciones de casing por
 * una migración a medias: unos traen `nome`/`cognome` y otros `Nome`/`Cognome`.
 */
export function getOwnerDisplayName(
  owner: Record<string, any> | null | undefined,
  fallback = 'Proprietario da verificare',
): string {
  if (!owner) return fallback;
  const nome = (owner.nome || owner.Nome || '').trim();
  const cognome = (owner.cognome || owner.Cognome || '').trim();
  const full = `${nome} ${cognome}`.trim();
  return full || fallback;
}
