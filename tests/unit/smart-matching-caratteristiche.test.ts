import { describe, it, expect } from 'vitest';
import { calculateMatch } from '@/lib/smart-matching';

// Cliente que exige ascensor. Es el caso que disparaba la exclusion.
const richiestaConAscensore: any = {
  Operazione: { Vendita: true },
  Caratteristiche: { Ascensore: true },
};

const base = {
  GestioneCommerciale: { InVendita: true, PrezzoVendita: 200000 },
  DatiBase: { Tipologia: 'Appartamento', Citta: 'Marsala' },
  DettagliFisici: { MetriCommerciali: 90, CamereLetto: 3 },
};

describe('calculateMatch — gate de Caratteristiche', () => {
  it('EL BUG: un inmueble SIN el mapa Caratteristiche ya no se excluye', () => {
    // Ausencia del mapa = dato desconocido, no ausencia de la caracteristica.
    // Antes devolvia null y el inmueble desaparecia de todo matching en el que
    // el cliente pidiera cualquier caracteristica.
    const sinMapa = { ...base };
    expect(calculateMatch(richiestaConAscensore, sinMapa)).not.toBeNull();
  });

  it('un mapa vacio cuenta como desconocido, no como negativa', () => {
    const mapaVacio = { ...base, Caratteristiche: {} };
    expect(calculateMatch(richiestaConAscensore, mapaVacio)).not.toBeNull();
  });

  it('el gate SIGUE excluyendo cuando el dato si se conoce y dice que no', () => {
    // La ficha esta rellena y no tiene ascensor: excluir es correcto y esto
    // no debe cambiar.
    const conMapaSinAscensor = {
      ...base,
      Caratteristiche: { Giardino: true, Ascensore: false },
    };
    expect(calculateMatch(richiestaConAscensore, conMapaSinAscensor)).toBeNull();
  });

  it('el gate SIGUE excluyendo si el mapa existe y no menciona la clave pedida', () => {
    // Ficha rellena en la que nadie marco el ascensor: se interpreta como que
    // no lo tiene, que es el comportamiento que ya habia.
    const conMapaOtraClave = { ...base, Caratteristiche: { Giardino: true } };
    expect(calculateMatch(richiestaConAscensore, conMapaOtraClave)).toBeNull();
  });

  it('un inmueble que SI tiene lo pedido sigue casando', () => {
    const conAscensor = { ...base, Caratteristiche: { Ascensore: true } };
    expect(calculateMatch(richiestaConAscensore, conAscensor)).not.toBeNull();
  });

  it('sin caracteristicas pedidas, el gate no interviene en ningun caso', () => {
    const sinExigencias: any = { Operazione: { Vendita: true } };
    expect(calculateMatch(sinExigencias, { ...base })).not.toBeNull();
    expect(calculateMatch(sinExigencias, { ...base, Caratteristiche: {} })).not.toBeNull();
  });

  it('el arreglo NO toca los otros gates: la operacion sigue excluyendo', () => {
    // Un inmueble solo en alquiler no puede casar con quien busca comprar,
    // tenga o no mapa de caracteristicas.
    const soloAffitto = {
      ...base,
      GestioneCommerciale: { InAffitto: true, PrezzoAffitto: 800 },
    };
    expect(calculateMatch(richiestaConAscensore, soloAffitto)).toBeNull();
  });
});
