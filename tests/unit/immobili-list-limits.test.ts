import { describe, it, expect } from 'vitest';
import { resolveListLimits, SCAN_CAP } from '@/lib/immobili/list-limits';

describe('resolveListLimits — tope de salida', () => {
  it('sin parametro limit no recorta', () => {
    expect(resolveListLimits(null, false).limitCount).toBe(0);
  });

  it('un limit valido se respeta', () => {
    expect(resolveListLimits('4', false).limitCount).toBe(4);
  });

  it('valores sin sentido se tratan como ausentes, no como recorte a cero', () => {
    for (const raw of ['0', '-3', 'abc', '']) {
      expect(resolveListLimits(raw, false).limitCount).toBe(0);
    }
  });
});

describe('resolveListLimits — tope de escaneo', () => {
  it('sin limit escanea hasta el tope duro', () => {
    expect(resolveListLimits(null, false).scanLimit).toBe(SCAN_CAP);
  });

  it('CON busqueda de texto NO empuja el limit a la consulta', () => {
    // Es la trampa que ya mordio a /api/clienti: recortar antes de filtrar en
    // memoria haria que `?q=rossi&limit=6` devolviese casi siempre nada.
    // Los seis typeaheads del CRM pasan limit siempre junto a q.
    const r = resolveListLimits('6', true);
    expect(r.scanLimit).toBe(SCAN_CAP);
    expect(r.limitCount).toBe(6); // pero el recorte de SALIDA si se aplica
  });

  it('sin busqueda empuja el limit con colchon de 3N+10', () => {
    expect(resolveListLimits('4', false).scanLimit).toBe(22);
    expect(resolveListLimits('1', false).scanLimit).toBe(13);
  });

  it('el colchon nunca supera el tope duro', () => {
    expect(resolveListLimits('5000', false).scanLimit).toBe(SCAN_CAP);
  });

  it('el colchon deja margen para el filtro en JS de status=attivi', () => {
    // `attivi` y el descarte de pendientes de cancelacion se aplican DESPUES de
    // la consulta, asi que el escaneo tiene que pedir mas de lo que se devuelve.
    const { limitCount, scanLimit } = resolveListLimits('4', false);
    expect(scanLimit).toBeGreaterThan(limitCount);
  });
});
