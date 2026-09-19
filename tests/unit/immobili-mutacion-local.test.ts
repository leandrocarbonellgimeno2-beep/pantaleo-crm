import { describe, it, expect } from 'vitest';
import {
  perteneceALaVista,
  quitarDelCatalogo,
  cambiarEstadoEnCatalogo,
  fusionarEnCatalogo,
  type Catalogo,
  type Vista,
} from '@/lib/immobili/mutacion-local';

const VISTA_POR_DEFECTO: Vista = { estado: 'Attivi', tipo: 'Tutti' };

const activo = (id: string, codice: string, extra: any = {}) => ({
  id,
  DatiBase: { Codice: codice },
  GestioneCommerciale: { Sospeso: false, InVendita: true, PrezzoVendita: 100000, ...(extra.gc || {}) },
  thumbnail: 'foto.jpg',
  imageCount: 3,
  ...extra.raiz,
});

const catalogo = (...docs: any[]): Catalogo => ({ data: docs, totalCount: docs.length });

describe('perteneceALaVista', () => {
  it('la vista Attivi excluye a los suspendidos', () => {
    expect(perteneceALaVista(activo('a', '100'), { estado: 'Attivi', tipo: 'Tutti' })).toBe(true);
    expect(perteneceALaVista(activo('a', '100', { gc: { Sospeso: true } }), { estado: 'Attivi', tipo: 'Tutti' })).toBe(false);
  });

  it('la vista Sospesi excluye a los activos', () => {
    expect(perteneceALaVista(activo('a', '100'), { estado: 'Sospesi', tipo: 'Tutti' })).toBe(false);
    expect(perteneceALaVista(activo('a', '100', { gc: { Sospeso: true } }), { estado: 'Sospesi', tipo: 'Tutti' })).toBe(true);
  });

  it('la vista Tutti no discrimina por estado', () => {
    for (const s of [true, false]) {
      expect(perteneceALaVista(activo('a', '100', { gc: { Sospeso: s } }), { estado: 'Tutti', tipo: 'Tutti' })).toBe(true);
    }
  });

  it('un Sospeso ausente cuenta como activo, igual que en el resto del CRM', () => {
    const sinCampo = { id: 'a', DatiBase: { Codice: '100' }, GestioneCommerciale: { InVendita: true } };
    expect(perteneceALaVista(sinCampo, { estado: 'Attivi', tipo: 'Tutti' })).toBe(true);
    expect(perteneceALaVista(sinCampo, { estado: 'Sospesi', tipo: 'Tutti' })).toBe(false);
  });

  it('el tipo de operacion tambien filtra', () => {
    const soloAffitto = activo('a', '100', { gc: { InVendita: false, InAffitto: true } });
    expect(perteneceALaVista(soloAffitto, { estado: 'Attivi', tipo: 'Vendita' })).toBe(false);
    expect(perteneceALaVista(soloAffitto, { estado: 'Attivi', tipo: 'Affitto' })).toBe(true);
    expect(perteneceALaVista(soloAffitto, { estado: 'Attivi', tipo: 'Tutti' })).toBe(true);
  });

  it('los pendientes de cancelacion no pertenecen a ninguna vista', () => {
    const borrado = activo('a', '100', { raiz: { _status: 'pendente_cancellazione' } });
    for (const estado of ['Attivi', 'Sospesi', 'Tutti'] as const) {
      expect(perteneceALaVista(borrado, { estado, tipo: 'Tutti' })).toBe(false);
    }
  });
});

describe('cambiarEstadoEnCatalogo — LA regla del bucle', () => {
  it('suspender desde la vista Attivi QUITA la tarjeta, no la marca', () => {
    // Es el punto entero del cambio. Si solo se parcheara el campo, la tarjeta
    // se quedaria en pantalla con una insignia «Sospeso» dentro de la pestaña
    // «Attivi», contradiciendo al filtro que el usuario tiene puesto.
    const c = catalogo(activo('a', '100'), activo('b', '101'));
    const r = cambiarEstadoEnCatalogo(c, 'a', true, { estado: 'Attivi', tipo: 'Tutti' });
    expect(r.data.map((d) => d.id)).toEqual(['b']);
    expect(r.totalCount).toBe(1);
  });

  it('reactivar desde la vista Sospesi tambien QUITA', () => {
    const c = catalogo(
      activo('a', '100', { gc: { Sospeso: true } }),
      activo('b', '101', { gc: { Sospeso: true } }),
    );
    const r = cambiarEstadoEnCatalogo(c, 'b', false, { estado: 'Sospesi', tipo: 'Tutti' });
    expect(r.data.map((d) => d.id)).toEqual(['a']);
    expect(r.totalCount).toBe(1);
  });

  it('en la vista Tutti se ACTUALIZA en su sitio, sin quitar nada', () => {
    const c = catalogo(activo('a', '100'), activo('b', '101'));
    const r = cambiarEstadoEnCatalogo(c, 'a', true, { estado: 'Tutti', tipo: 'Tutti' });
    expect(r.data.map((d) => d.id)).toEqual(['a', 'b']);
    expect(r.data[0].GestioneCommerciale.Sospeso).toBe(true);
    expect(r.totalCount).toBe(2);
  });

  it('el resto de GestioneCommerciale sobrevive: el documento viene proyectado', () => {
    const c = catalogo(activo('a', '100'));
    const r = cambiarEstadoEnCatalogo(c, 'a', true, { estado: 'Tutti', tipo: 'Tutti' });
    expect(r.data[0].GestioneCommerciale).toEqual({
      Sospeso: true,
      InVendita: true,
      PrezzoVendita: 100000,
    });
  });

  it('no muta el catalogo de entrada', () => {
    const original = activo('a', '100');
    const c = catalogo(original, activo('b', '101'));
    cambiarEstadoEnCatalogo(c, 'a', true, { estado: 'Tutti', tipo: 'Tutti' });
    expect(original.GestioneCommerciale.Sospeso).toBe(false);
    expect(c.data.length).toBe(2);
  });

  it('un id que no esta en la pagina no rompe nada', () => {
    const c = catalogo(activo('a', '100'));
    expect(cambiarEstadoEnCatalogo(c, 'fantasma', true, VISTA_POR_DEFECTO)).toBe(c);
  });

  it('un catalogo vacio o sin datos no revienta', () => {
    expect(cambiarEstadoEnCatalogo(catalogo(), 'a', true, VISTA_POR_DEFECTO).data).toEqual([]);
    expect(cambiarEstadoEnCatalogo({ data: null as any, totalCount: 0 }, 'a', true, VISTA_POR_DEFECTO).data).toBeNull();
  });
});

describe('quitarDelCatalogo', () => {
  it('quita y baja el total', () => {
    const c = catalogo(activo('a', '100'), activo('b', '101'), activo('c', '102'));
    const r = quitarDelCatalogo(c, 'b');
    expect(r.data.map((d) => d.id)).toEqual(['a', 'c']);
    expect(r.totalCount).toBe(2);
  });

  it('quitar algo que no esta devuelve el mismo objeto, sin tocar el total', () => {
    const c = catalogo(activo('a', '100'));
    expect(quitarDelCatalogo(c, 'fantasma')).toBe(c);
  });

  it('el total nunca baja de cero aunque venga descuadrado', () => {
    const c: Catalogo = { data: [activo('a', '100')], totalCount: 0 };
    expect(quitarDelCatalogo(c, 'a').totalCount).toBe(0);
  });
});

describe('fusionarEnCatalogo', () => {
  it('actualiza en su sitio y conserva el orden', () => {
    const c = catalogo(activo('a', '102'), activo('b', '101'), activo('c', '100'));
    const r = fusionarEnCatalogo(c, { id: 'b', DatiBase: { Codice: '101', Citta: 'Marsala' } }, VISTA_POR_DEFECTO);
    expect(r.data.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(r.data[1].DatiBase.Citta).toBe('Marsala');
  });

  it('LO QUE LLEGA SE FUSIONA SOBRE LO QUE HABIA, no al reves', () => {
    // La ficha editada trae el documento completo pero NO trae thumbnail ni
    // imageCount, que los calcula el listado al proyectar. Sustituir a pelo
    // dejaria la tarjeta sin foto.
    const c = catalogo(activo('a', '100'));
    const r = fusionarEnCatalogo(c, { id: 'a', DatiBase: { Codice: '100' }, GestioneCommerciale: { Sospeso: false } }, VISTA_POR_DEFECTO);
    expect(r.data[0].thumbnail).toBe('foto.jpg');
    expect(r.data[0].imageCount).toBe(3);
  });

  it('si la edicion lo saca de la vista, se quita', () => {
    // Guardar la ficha con «Sospeso» desde la pestaña «Attivi».
    const c = catalogo(activo('a', '100'), activo('b', '101'));
    const r = fusionarEnCatalogo(c, { id: 'a', GestioneCommerciale: { Sospeso: true } }, { estado: 'Attivi', tipo: 'Tutti' });
    expect(r.data.map((d) => d.id)).toEqual(['b']);
    expect(r.totalCount).toBe(1);
  });

  it('cambiar el tipo de operacion tambien lo saca de una vista por tipo', () => {
    const c = catalogo(activo('a', '100'));
    const r = fusionarEnCatalogo(
      c,
      { id: 'a', GestioneCommerciale: { Sospeso: false, InVendita: false, InAffitto: true } },
      { estado: 'Attivi', tipo: 'Vendita' },
    );
    expect(r.data).toEqual([]);
  });

  it('uno que no estaba y si pertenece se inserta ordenado por codigo', () => {
    const c = catalogo(activo('a', '102'), activo('c', '100'));
    const r = fusionarEnCatalogo(c, activo('b', '101'), VISTA_POR_DEFECTO);
    expect(r.data.map((d) => d.DatiBase.Codice)).toEqual(['102', '101', '100']);
    expect(r.totalCount).toBe(3);
  });

  it('uno que no estaba y NO pertenece no se cuela', () => {
    const c = catalogo(activo('a', '100'));
    const r = fusionarEnCatalogo(c, activo('z', '999', { gc: { Sospeso: true } }), { estado: 'Attivi', tipo: 'Tutti' });
    expect(r).toBe(c);
  });

  it('un documento sin id se ignora', () => {
    const c = catalogo(activo('a', '100'));
    expect(fusionarEnCatalogo(c, { DatiBase: { Codice: '999' } }, VISTA_POR_DEFECTO)).toBe(c);
  });

  it('no muta el catalogo de entrada', () => {
    const c = catalogo(activo('a', '100'));
    const antes = c.data[0];
    fusionarEnCatalogo(c, { id: 'a', DatiBase: { Codice: '100', Citta: 'Trapani' } }, VISTA_POR_DEFECTO);
    expect(antes.DatiBase.Citta).toBeUndefined();
  });
});

describe('la secuencia real de uso', () => {
  it('suspender, deshacer y volver a suspender deja el mismo resultado', () => {
    // La pantalla guarda la foto anterior para poder deshacer si el PATCH
    // falla. Esa foto tiene que ser exactamente recuperable.
    const inicial = catalogo(activo('a', '100'), activo('b', '101'));
    const tras = cambiarEstadoEnCatalogo(inicial, 'a', true, VISTA_POR_DEFECTO);
    expect(tras.data.map((d) => d.id)).toEqual(['b']);

    // «Deshacer» es restaurar la foto anterior tal cual.
    expect(inicial.data.map((d) => d.id)).toEqual(['a', 'b']);
    expect(inicial.totalCount).toBe(2);

    const otraVez = cambiarEstadoEnCatalogo(inicial, 'a', true, VISTA_POR_DEFECTO);
    expect(otraVez.data.map((d) => d.id)).toEqual(['b']);
    expect(otraVez.totalCount).toBe(1);
  });

  it('borrar y luego editar otro no descuadra el total', () => {
    let c = catalogo(activo('a', '102'), activo('b', '101'), activo('c', '100'));
    c = quitarDelCatalogo(c, 'b');
    c = fusionarEnCatalogo(c, { id: 'c', DatiBase: { Codice: '100', Zona: 'Centro' } }, VISTA_POR_DEFECTO);
    expect(c.data.map((d) => d.id)).toEqual(['a', 'c']);
    expect(c.totalCount).toBe(2);
  });
});
