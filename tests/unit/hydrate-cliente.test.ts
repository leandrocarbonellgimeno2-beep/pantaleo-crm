import { describe, it, expect } from 'vitest';
import { hydrateCliente } from '@/lib/hydrate-cliente';

describe('hydrateCliente — garantiza la forma', () => {
  it('un cliente proyectado (sin FirmaDigitale ni Documentazione) queda completo', () => {
    // Es exactamente lo que devuelve el .select() del listado.
    const c = hydrateCliente({
      id: 'abc',
      DatiPersonali: { Nome: 'Mario' },
      status: 'Attivo',
    } as any);

    // El acceso que reventaba el tab "Hoja Legal & Firma".
    expect(c.FirmaDigitale.UrlFirma).toBe('');
    expect(c.FirmaDigitale.HasFirma).toBe(false);
    expect(c.Documentazione.AltriDocumenti).toEqual([]);
    expect(c.Documentazione.DocumentiIdentita).toEqual([]);
    expect(c.Matching.Proposti).toEqual([]);
  });

  it('un cliente legacy sin DatiPersonali ni Richiesta no revienta el tab por defecto', () => {
    const c = hydrateCliente({ id: 'x', nome: 'Luigi', cognome: 'Verdi', cell1: '333' } as any);
    expect(c.DatiPersonali.Nome).toBe('Luigi');
    expect(c.DatiPersonali.Cognome).toBe('Verdi');
    expect(c.DatiPersonali.Telefono).toBe('333');
    expect(c.Richiesta.Operazione).toBeDefined();
  });

  it('no pisa los datos estructurados con los legacy', () => {
    const c = hydrateCliente({
      DatiPersonali: { Nome: 'Estructurado' },
      nome: 'Legacy',
    } as any);
    expect(c.DatiPersonali.Nome).toBe('Estructurado');
  });

  it('tolera null y undefined', () => {
    expect(hydrateCliente(null).DatiPersonali.Nome).toBe('');
    expect(hydrateCliente(undefined).FirmaDigitale.HasFirma).toBe(false);
  });
});

describe('hydrateCliente — conserva lo que llega', () => {
  it('conserva los valores anidados presentes', () => {
    const c = hydrateCliente({
      FirmaDigitale: { HasFirma: true, UrlFirma: 'data:image/png;base64,AAA', DataFirma: '2026-01-01' },
    } as any);
    expect(c.FirmaDigitale.HasFirma).toBe(true);
    expect(c.FirmaDigitale.UrlFirma).toBe('data:image/png;base64,AAA');
  });

  it('fusiona en profundidad sin perder las hermanas del mapa', () => {
    const c = hydrateCliente({ Documentazione: { AltriDocumenti: ['u1'] } } as any);
    expect(c.Documentazione.AltriDocumenti).toEqual(['u1']);
    expect(c.Documentazione.ModuliPrivacy).toEqual([]);
  });

  it('los arrays reemplazan, no se concatenan con el default', () => {
    const c = hydrateCliente({ Matching: { Proposti: ['p1'] } } as any);
    expect(c.Matching.Proposti).toEqual(['p1']);
  });

  it('conserva las claves ajenas a la plantilla', () => {
    const c = hydrateCliente({ id: 'abc', _status: 'pendente_cancellazione' } as any);
    expect(c.id).toBe('abc');
    expect((c as any)._status).toBe('pendente_cancellazione');
  });

  it('un null del documento no sustituye al default', () => {
    const c = hydrateCliente({ FirmaDigitale: null, DatiPersonali: { Nome: null } } as any);
    expect(c.FirmaDigitale.UrlFirma).toBe('');
    expect(c.DatiPersonali.Nome).toBe('');
  });

  it('no muta el objeto de entrada', () => {
    const input: any = { DatiPersonali: { Nome: 'Mario' } };
    hydrateCliente(input);
    expect(input.DatiPersonali).toEqual({ Nome: 'Mario' });
    expect(input.FirmaDigitale).toBeUndefined();
  });
});
