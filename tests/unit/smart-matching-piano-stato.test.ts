import { describe, it, expect } from 'vitest';
import { calculateMatch } from '@/lib/smart-matching';

/**
 * Los dos criterios que cruzaban las PREFERENCIAS del cliente —listas cerradas
 * de types/cliente.ts— contra los campos del inmueble, que son texto libre.
 *
 * Las cadenas de estos tests no son inventadas: son los valores reales de los
 * 870 inmuebles de producción, con su frecuencia medida al lado.
 *
 * Se puntúa a través de `calculateMatch` y se lee el desglose, en vez de
 * exportar las funciones internas: así el test se apoya en la API pública y no
 * se rompe si mañana se reorganiza el fichero por dentro.
 */

/** El score del criterio pedido, aislado del resto del cálculo. */
function scoreDe(criterio: string, richiesta: any, immobile: any): number {
  const r = calculateMatch(richiesta, immobile);
  if (!r) throw new Error('calculateMatch devolvió null: algún gate duro se ha activado');
  const fila = r.breakdown.find((b) => b.criterio === criterio);
  if (!fila) throw new Error('no hay criterio ' + criterio + ' en el desglose');
  return fila.score;
}

/** Inmueble mínimo que pasa todos los gates duros. */
const inmueble = (dettagli: any) => ({
  id: 'x',
  DatiBase: { Codice: '1001' },
  GestioneCommerciale: { InVendita: true, PrezzoVendita: 100000 },
  DettagliFisici: dettagli,
  Caratteristiche: { Ascensore: false },
  Textos: {},
});

/** Petición mínima sin gates: solo el criterio que se quiere medir. */
const pide = (extra: any) => ({ Operazione: {}, ...extra });

describe('stato finiture: la escala se comparaba con igualdad estricta', () => {
  const conStato = (s: string) => inmueble({ StatoFiniture: s });

  it('EL CASO: «Buone» contra un cliente que acepta «Buono»', () => {
    // 137 inmuebles dicen «Buone», en plural, y la escala decia «buono». Con
    // indexOf eso era -1, o sea 0.5 neutro: NUNCA llegaban al 1.0 de quien
    // pedia exactamente eso.
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Buono'] }), conStato('Buone'))).toBe(1);
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Buono'] }), conStato('BUONE'))).toBe(1);
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Buono'] }), conStato('Buono'))).toBe(1);
  });

  it('los estados que la escala no tenia ya puntuan', () => {
    // «Normali» son 299 inmuebles, el mas frecuente de todos, y no estaba.
    // «Da Sistemare» 39, «Ristrutturato» 13.
    for (const [estado, acepta] of [
      ['Normali', 'Normali'],
      ['Da Sistemare', 'Da Sistemare'],
      ['Ristrutturato', 'Ristrutturato'],
    ] as const) {
      expect(scoreDe('finiture', pide({ StatoFinitureAccettati: [acepta] }), conStato(estado))).toBe(1);
    }
  });

  it('la caja de mayusculas y el plural dejan de importar', () => {
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Ottime'] }), conStato('OTTIMO'))).toBe(1);
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Da Ristrutturare'] }), conStato('Da ristrutturare'))).toBe(1);
  });

  it('la curva de proximidad se conserva: mismo estado, 1.0', () => {
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Nuovo'] }), conStato('Nuovo'))).toBe(1);
  });

  it('cuanto mas lejos en la escala, menos puntua, y nunca negativo', () => {
    const cercano = scoreDe('finiture', pide({ StatoFinitureAccettati: ['Ottime'] }), conStato('Buone'));
    const lejano = scoreDe('finiture', pide({ StatoFinitureAccettati: ['Nuovo'] }), conStato('Da Ristrutturare'));
    expect(cercano).toBeGreaterThan(lejano);
    expect(cercano).toBeLessThan(1);
    expect(lejano).toBeGreaterThanOrEqual(0);
  });

  it('con varios estados aceptados se queda con el mejor', () => {
    const s = scoreDe('finiture', pide({ StatoFinitureAccettati: ['Nuovo', 'Buono'] }), conStato('Buone'));
    expect(s).toBe(1);
  });

  it('lo que no informa de nada sigue siendo NEUTRO, no un castigo', () => {
    // 182 inmuebles dicen «-- Non specificato --». Tratar «no lo se» como
    // «esta mal» es justo el fallo que este cambio vino a quitar.
    for (const v of ['-- Non specificato --', '', '-']) {
      expect(scoreDe('finiture', pide({ StatoFinitureAccettati: ['Nuovo'] }), conStato(v))).toBe(0.5);
    }
  });

  it('sin preferencia del cliente, comodin', () => {
    expect(scoreDe('finiture', pide({ StatoFinitureAccettati: [] }), conStato('Buone'))).toBe(0.6);
    expect(scoreDe('finiture', pide({}), conStato('Buone'))).toBe(0.6);
  });
});

describe('piano: includes() sin frontera de palabra y comparaciones a mano', () => {
  const conPiano = (p: string) => inmueble({ Piano: p });

  it('EL FALSO POSITIVO: «Seminterrato» contiene «terra» como subcadena', () => {
    // Con includes() un semisotano puntuaba 1.0 para quien pedia planta baja.
    expect(scoreDe('piano', pide({ PianoPreferenza: 'Piano Terra' }), conPiano('Seminterrato'))).toBeLessThan(1);
    expect(scoreDe('piano', pide({ PianoPreferenza: 'Piano Terra' }), conPiano('Semicantinato'))).toBeLessThan(1);
  });

  it('las tres formas de escribir la planta baja puntuan igual', () => {
    for (const v of ['TERRA', 'Terra', 'terra', 'Piano Terra']) {
      expect(scoreDe('piano', pide({ PianoPreferenza: 'Piano Terra' }), conPiano(v))).toBe(1);
    }
  });

  it('los ordinales con letra ya cuentan como plantas intermedias', () => {
    // «PRIMO», «Primo Piano» y «primo piano» fallaban: la comparacion exigia la
    // cadena exacta «primo» y parseInt daba NaN.
    for (const v of ['PRIMO', 'Primo', 'Primo Piano', 'primo piano', 'SECONDO', 'TERZO', '1', '2', '3', '1°']) {
      expect(scoreDe('piano', pide({ PianoPreferenza: 'Piani Intermedi' }), conPiano(v))).toBe(1);
    }
  });

  it('«QUARTO» y «Quarto Piano» ya cuentan como planta alta', () => {
    for (const v of ['QUARTO', 'Quarto Piano', '4', '5', '6', 'Attico', 'Mansarda']) {
      expect(scoreDe('piano', pide({ PianoPreferenza: 'Attico / Ultimo Piano' }), conPiano(v))).toBe(1);
    }
  });

  it('un inmueble en varias plantas satisface las dos preferencias', () => {
    const multi = conPiano('Piano Terra e Primo');
    expect(scoreDe('piano', pide({ PianoPreferenza: 'Piano Terra' }), multi)).toBe(1);
    expect(scoreDe('piano', pide({ PianoPreferenza: 'Piani Intermedi' }), multi)).toBe(1);
  });

  it('la planta desconocida es NEUTRA, no un castigo', () => {
    // 72 de los 631 activos no dicen nada util: «», «-», o la errata «PRIMP».
    for (const v of ['', '-', 'PRIMP', 'Su più livelli']) {
      expect(scoreDe('piano', pide({ PianoPreferenza: 'Piano Terra' }), conPiano(v))).toBe(0.5);
    }
  });

  it('una planta que no es la pedida puntua bajo, pero no cero', () => {
    const s = scoreDe('piano', pide({ PianoPreferenza: 'Piano Terra' }), conPiano('3'));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.5);
  });

  it('una preferencia fuera de la lista deja de ignorarse en silencio', () => {
    // Hay un cliente en la base con «1° Piano» escrito a mano, que no es
    // ninguno de los cuatro valores de PIANI_PREFERENZA. Antes caia en el
    // `default` y devolvia comodin: la preferencia no filtraba nada.
    expect(scoreDe('piano', pide({ PianoPreferenza: '1° Piano' }), conPiano('1'))).toBe(1);
    expect(scoreDe('piano', pide({ PianoPreferenza: '1° Piano' }), conPiano('Primo'))).toBe(1);
    expect(scoreDe('piano', pide({ PianoPreferenza: '1° Piano' }), conPiano('4'))).toBeLessThan(1);
  });

  it('«Qualsiasi» y la ausencia de preferencia siguen siendo comodin', () => {
    expect(scoreDe('piano', pide({ PianoPreferenza: 'Qualsiasi' }), conPiano('Basso'))).toBe(0.6);
    expect(scoreDe('piano', pide({}), conPiano('Basso'))).toBe(0.6);
  });
});

describe('ninguno de los dos es un gate duro', () => {
  it('un estado o una planta que no encajan NO eliminan el inmueble', () => {
    // Es la diferencia con el buscador avanzado, donde el mismo fallo escondia
    // inmuebles. Aqui solo mueve el ranking, y conviene que siga siendo asi.
    const r = calculateMatch(
      pide({ StatoFinitureAccettati: ['Nuovo'], PianoPreferenza: 'Attico / Ultimo Piano' }),
      inmueble({ StatoFiniture: 'Da Ristrutturare', Piano: 'Piano Terra' }),
    );
    expect(r).not.toBeNull();
    expect(r!.matchPercentage).toBeGreaterThan(0);
  });
});
