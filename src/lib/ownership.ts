/**
 * Pertenencia de un inmueble a un propietario.
 *
 * Hay DOS campos y los dos cuentan. El vinculo se crea escribiendo ambos
 * (api/proprietari/[id]/immobili/route.ts:87-88) y la lectura consulta primero
 * proprietarioId_real y cae a proprietarioId si no encuentra nada (:18 y :30),
 * porque quedan documentos heredados de antes de la migracion que solo tienen
 * el campo viejo.
 *
 * Por eso esta comprobacion acepta cualquiera de los dos. Exigir solo el nuevo
 * seria un falso negativo con consecuencias: el agente no podria deshacer un
 * vinculo legitimo de un inmueble antiguo.
 */
export function belongsToProprietario(
  propertyData: { proprietarioId?: unknown; proprietarioId_real?: unknown } | undefined | null,
  proprietarioId: string,
): boolean {
  if (!propertyData || typeof proprietarioId !== 'string' || proprietarioId.length === 0) {
    return false;
  }
  return (
    propertyData.proprietarioId_real === proprietarioId ||
    propertyData.proprietarioId === proprietarioId
  );
}
