import { describe, it, expect } from 'vitest';
import {
  mensajeDeFallo,
  esSesionCaducada,
  MENSAJE_SESION_CADUCADA,
  MENSAJE_SIN_PERMISOS,
} from '@/lib/errores-http';

/**
 * La sesion dura ocho horas y caduca de golpe, a media jornada, normalmente
 * con un formulario largo a medio rellenar. Cuando eso pasa la API responde
 * 401, pero cinco de los seis formularios enseñaban el mismo cartel que para
 * cualquier otro fallo: «Errore durante il salvataggio». El agente lo leia
 * como un problema pasajero y volvia a pulsar Salva, una y otra vez, sin que
 * ningun intento pudiera funcionar nunca.
 */

const GENERICO = 'Errore durante il salvataggio.';

describe('un 401 no es «un error»: es que hay que volver a entrar', () => {
  it('401 dice que la sesion caduco, no el mensaje generico', () => {
    const msg = mensajeDeFallo({ status: 401 }, GENERICO);
    expect(msg).toBe(MENSAJE_SESION_CADUCADA);
    expect(msg).not.toBe(GENERICO);
  });

  it('y el mensaje explica que el formulario no se pierde', () => {
    // Importa: si el agente cree que va a perder lo escrito, no vuelve a
    // entrar y sigue reintentando.
    expect(MENSAJE_SESION_CADUCADA.toLowerCase()).toContain('nuova scheda');
  });

  it('esSesionCaducada distingue el 401 de los demas', () => {
    expect(esSesionCaducada({ status: 401 })).toBe(true);
    expect(esSesionCaducada({ status: 403 })).toBe(false);
    expect(esSesionCaducada({ status: 500 })).toBe(false);
    expect(esSesionCaducada(null)).toBe(false);
  });
});

describe('un 403 tampoco: es que ese rol no puede', () => {
  it('403 habla de permisos', () => {
    expect(mensajeDeFallo({ status: 403 }, GENERICO)).toBe(MENSAJE_SIN_PERMISOS);
  });

  it('y no se confunde con la sesion caducada', () => {
    expect(mensajeDeFallo({ status: 403 }, GENERICO)).not.toBe(MENSAJE_SESION_CADUCADA);
  });
});

describe('el resto', () => {
  it('sin mensaje del servidor, el generico de quien llama', () => {
    expect(mensajeDeFallo({ status: 500 }, GENERICO)).toBe(GENERICO);
    expect(mensajeDeFallo({ status: 400 }, GENERICO)).toBe(GENERICO);
  });

  it('con mensaje del servidor, ese', () => {
    expect(mensajeDeFallo({ status: 409 }, GENERICO, 'Il cliente ha documenti associati'))
      .toBe('Il cliente ha documenti associati');
  });

  it('pero 401 y 403 mandan sobre el texto del servidor', () => {
    // Varias rutas devuelven 'Unauthorized' a secas, que no le dice nada al
    // agente.
    expect(mensajeDeFallo({ status: 401 }, GENERICO, 'Unauthorized')).toBe(MENSAJE_SESION_CADUCADA);
    expect(mensajeDeFallo({ status: 403 }, GENERICO, 'Permessi insufficienti')).toBe(MENSAJE_SIN_PERMISOS);
  });

  it('un «error» que no es texto no se pinta: «[object Object]» es peor que nada', () => {
    expect(mensajeDeFallo({ status: 500 }, GENERICO, { code: 'x' })).toBe(GENERICO);
    expect(mensajeDeFallo({ status: 500 }, GENERICO, ['a'])).toBe(GENERICO);
    expect(mensajeDeFallo({ status: 500 }, GENERICO, '   ')).toBe(GENERICO);
  });

  it('sin respuesta siquiera —caida de red— tampoco inventa', () => {
    expect(mensajeDeFallo(null, GENERICO)).toBe(GENERICO);
    expect(mensajeDeFallo(undefined, GENERICO)).toBe(GENERICO);
  });
});
