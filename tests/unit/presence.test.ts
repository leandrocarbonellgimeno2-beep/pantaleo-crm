import { describe, it, expect } from 'vitest';
import { estaOnline, VENTANA_ONLINE_MS } from '@/lib/services/presence';

describe('estaOnline — la ventana de 90 segundos', () => {
  const ahora = 1_700_000_000_000;

  it('un latido recien llegado cuenta como conectado', () => {
    expect(estaOnline(ahora - 1_000, ahora)).toBe(true);
  });

  it('justo dentro de la ventana sigue conectado', () => {
    expect(estaOnline(ahora - (VENTANA_ONLINE_MS - 1), ahora)).toBe(true);
  });

  it('justo fuera ya no', () => {
    // La ventana es el doble del intervalo de latido (45 s): asi un latido
    // perdido no desconecta a nadie, hacen falta dos seguidos.
    expect(estaOnline(ahora - VENTANA_ONLINE_MS, ahora)).toBe(false);
    expect(estaOnline(ahora - VENTANA_ONLINE_MS * 10, ahora)).toBe(false);
  });

  it('valores ausentes o imposibles no cuentan como conectado', () => {
    expect(estaOnline(0, ahora)).toBe(false);
    expect(estaOnline(NaN, ahora)).toBe(false);
    expect(estaOnline(-1, ahora)).toBe(false);
    expect(estaOnline(undefined as any, ahora)).toBe(false);
  });

  it('la ventana deja margen para un latido perdido', () => {
    // Es la razon de que sean 90 y no 45: una peticion que falla no debe
    // hacer parpadear a alguien en el panel.
    expect(VENTANA_ONLINE_MS).toBeGreaterThanOrEqual(45_000 * 2);
  });
});
