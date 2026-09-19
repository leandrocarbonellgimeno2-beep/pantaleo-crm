import { describe, it, expect } from 'vitest';
import {
  interpretarSospeso,
  prepararImmobileParaCrear,
  sanearImmobileParaEditar,
  seraVisibleEnElListado,
  SOSPESO_POR_DEFECTO,
} from '@/lib/immobili/sospeso';
import { buildUpdateArgs, toFieldPathEntries } from '@/lib/firestore-update';

describe('interpretarSospeso', () => {
  it('los booleanos pasan tal cual', () => {
    expect(interpretarSospeso(true)).toBe(true);
    expect(interpretarSospeso(false)).toBe(false);
  });

  it('entiende las variantes de texto que mandan los formularios y los CSV', () => {
    for (const v of ['true', 'TRUE', ' True ', '1', 'si', 'sì', 'yes', 'on']) {
      expect(interpretarSospeso(v)).toBe(true);
    }
    for (const v of ['false', 'FALSE', '0', 'no', 'off']) {
      expect(interpretarSospeso(v)).toBe(false);
    }
  });

  it('entiende los numeros', () => {
    expect(interpretarSospeso(1)).toBe(true);
    expect(interpretarSospeso(0)).toBe(false);
    expect(interpretarSospeso(NaN)).toBeUndefined();
  });

  it('lo ininteligible devuelve undefined, no false', () => {
    // La distincion es la que protege al inmueble suspendido: undefined
    // significa "no me consta", y editar no toca lo guardado.
    for (const v of [null, undefined, '', '   ', 'quizas', {}, [], () => {}]) {
      expect(interpretarSospeso(v)).toBeUndefined();
    }
  });
});

describe('prepararImmobileParaCrear — el campo SIEMPRE queda puesto', () => {
  it('sin GestioneCommerciale crea el mapa con Sospeso false', () => {
    const r = prepararImmobileParaCrear({ DatiBase: { Codice: '1001' } });
    expect((r.GestioneCommerciale as any).Sospeso).toBe(false);
    expect(SOSPESO_POR_DEFECTO).toBe(false);
  });

  it('con GestioneCommerciale pero sin Sospeso lo anade sin tocar lo demas', () => {
    const r = prepararImmobileParaCrear({
      GestioneCommerciale: { InVendita: true, PrezzoVendita: 250000 },
    });
    expect(r.GestioneCommerciale).toEqual({
      InVendita: true,
      PrezzoVendita: 250000,
      Sospeso: false,
    });
  });

  it('respeta un Sospeso verdadero que venga del formulario', () => {
    const r = prepararImmobileParaCrear({ GestioneCommerciale: { Sospeso: true } });
    expect((r.GestioneCommerciale as any).Sospeso).toBe(true);
  });

  it('normaliza la cadena "true" a booleano', () => {
    // Si se guardara la cadena, where('==', false) no la encontraria y tampoco
    // where('==', true): el inmueble quedaria fuera de las DOS vistas.
    const r = prepararImmobileParaCrear({ GestioneCommerciale: { Sospeso: 'true' } });
    expect((r.GestioneCommerciale as any).Sospeso).toBe(true);
  });

  it('un valor basura cae a false, es decir, VISIBLE', () => {
    for (const basura of [null, 'lo que sea', {}, []]) {
      const r = prepararImmobileParaCrear({ GestioneCommerciale: { Sospeso: basura } });
      expect((r.GestioneCommerciale as any).Sospeso).toBe(false);
    }
  });

  it('no muta el payload de entrada', () => {
    const entrada = { GestioneCommerciale: { InVendita: true } };
    prepararImmobileParaCrear(entrada);
    expect(entrada.GestioneCommerciale).toEqual({ InVendita: true });
  });

  it('sea cual sea la entrada, lo que sale es visible o suspendido, nunca invisible', () => {
    const entradas: any[] = [
      {},
      { GestioneCommerciale: null },
      { GestioneCommerciale: 'texto' },
      { GestioneCommerciale: [] },
      { GestioneCommerciale: { Sospeso: undefined } },
      { GestioneCommerciale: { Sospeso: NaN } },
    ];
    for (const e of entradas) {
      const v = (prepararImmobileParaCrear(e).GestioneCommerciale as any).Sospeso;
      expect(typeof v).toBe('boolean');
    }
  });
});

describe('sanearImmobileParaEditar — un PATCH no puede borrar ni corromper el campo', () => {
  it('si el payload no trae Sospeso, no se toca nada', () => {
    const p = { DatiBase: { Prezzo: 100 }, GestioneCommerciale: { InVendita: true } };
    const r = sanearImmobileParaEditar(p);
    expect(r.GestioneCommerciale).toEqual({ InVendita: true });
    // Y lo que importa de verdad: no se genera ninguna escritura para Sospeso.
    const rutas = toFieldPathEntries(r as any).map((e) => e.segments.join('.'));
    expect(rutas).not.toContain('GestioneCommerciale.Sospeso');
  });

  it('un null NO se escribe: la clave se descarta y lo guardado sobrevive', () => {
    // Escribir null seria lo peor de todo: ni false ni true, o sea invisible en
    // las dos vistas. Y convertirlo a false reactivaria un inmueble suspendido.
    const r = sanearImmobileParaEditar({ GestioneCommerciale: { Sospeso: null, InVendita: true } });
    expect(Object.prototype.hasOwnProperty.call(r.GestioneCommerciale as any, 'Sospeso')).toBe(false);
    expect((r.GestioneCommerciale as any).InVendita).toBe(true);
  });

  it('una cadena basura tampoco se escribe', () => {
    for (const basura of ['', '   ', 'quizas', {}, []]) {
      const r = sanearImmobileParaEditar({ GestioneCommerciale: { Sospeso: basura } });
      expect(Object.prototype.hasOwnProperty.call(r.GestioneCommerciale as any, 'Sospeso')).toBe(false);
    }
  });

  it('un cambio legitimo si pasa, normalizado', () => {
    expect((sanearImmobileParaEditar({ GestioneCommerciale: { Sospeso: true } }).GestioneCommerciale as any).Sospeso).toBe(true);
    expect((sanearImmobileParaEditar({ GestioneCommerciale: { Sospeso: 'false' } }).GestioneCommerciale as any).Sospeso).toBe(false);
    expect((sanearImmobileParaEditar({ GestioneCommerciale: { Sospeso: 0 } }).GestioneCommerciale as any).Sospeso).toBe(false);
  });

  it('un mapa GestioneCommerciale vacio no genera ninguna escritura', () => {
    // buildUpdateArgs omite los mapas vacios a proposito: escribir {} habria
    // REEMPLAZADO el mapa entero y borrado precio, InVendita y Sospeso de golpe.
    const r = sanearImmobileParaEditar({ GestioneCommerciale: {} });
    expect(buildUpdateArgs(r as any)).toEqual([]);
  });

  it('no muta el payload de entrada', () => {
    const entrada = { GestioneCommerciale: { Sospeso: null } };
    sanearImmobileParaEditar(entrada);
    expect(entrada.GestioneCommerciale.Sospeso).toBeNull();
  });
});

describe('la regla se sostiene de extremo a extremo', () => {
  it('lo creado por prepararImmobileParaCrear es visible en el listado', () => {
    expect(seraVisibleEnElListado(prepararImmobileParaCrear({}))).toBe(true);
    expect(seraVisibleEnElListado(prepararImmobileParaCrear({ GestioneCommerciale: { Sospeso: true } }))).toBe(false);
  });

  it('lo que hoy hace invisible a un inmueble queda descrito por el test', () => {
    // Estos tres son exactamente los estados que la consulta de Firestore
    // where('Sospeso','==',false) deja fuera de la pantalla principal.
    expect(seraVisibleEnElListado({})).toBe(false);
    expect(seraVisibleEnElListado({ GestioneCommerciale: {} })).toBe(false);
    expect(seraVisibleEnElListado({ GestioneCommerciale: { Sospeso: null } })).toBe(false);
  });

  it('ningun PATCH saneado puede escribir un Sospeso no booleano', () => {
    const payloads: any[] = [
      { GestioneCommerciale: { Sospeso: null } },
      { GestioneCommerciale: { Sospeso: 'basura' } },
      { GestioneCommerciale: { Sospeso: {} } },
      { GestioneCommerciale: { Sospeso: [] } },
      { GestioneCommerciale: { Sospeso: 'true' } },
      { GestioneCommerciale: { Sospeso: 1 } },
    ];
    for (const p of payloads) {
      for (const { segments, value } of toFieldPathEntries(sanearImmobileParaEditar(p))) {
        if (segments.join('.') === 'GestioneCommerciale.Sospeso') {
          expect(typeof value).toBe('boolean');
        }
      }
    }
  });
});
