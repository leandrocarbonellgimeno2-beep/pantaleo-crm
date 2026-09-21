import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Los datos de la agencia, editables desde Administracion.
 *
 * Antes estaban escritos a mano en el codigo: completarlos exigia tocar un
 * fichero y volver a desplegar. Ahora viven en `_config/datos_titular` y los
 * edita Francesco.
 *
 * Lo que se fija aqui:
 *  - que SOLO el propietario pueda verlos y cambiarlos
 *  - que la cuenta de «campos que faltan» sea correcta, porque de ella depende
 *    el aviso de las dos paginas publicas
 *  - que una lectura rota NO tumbe /privacy y /terms
 *  - que quede constancia de quien los cambio
 */

process.env.SESSION_SECRET = 'secreto-de-pruebas-suficientemente-largo-123456';

const { obtenerUsuario } = vi.hoisted(() => ({
  obtenerUsuario: vi.fn(async () => null as any),
}));

vi.mock('@/lib/services/users', () => ({
  obtenerUsuario,
  listarUsuarios: vi.fn(async () => []),
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  validarNuevoUsuario: vi.fn(),
  validarPassword: vi.fn(),
  contarPropietariosActivos: vi.fn(async () => 2),
  PASSWORD_MIN: 10,
}));

const { audit } = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('@/lib/services/audit', () => ({ audit }));

const { revalidados } = vi.hoisted(() => ({ revalidados: [] as string[] }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => { revalidados.push(p); } }));

const { estado } = vi.hoisted(() => ({
  estado: {
    documento: null as any,
    escrituras: [] as any[],
    lecturaFalla: false,
  },
}));

vi.mock('@/lib/firebase-admin', () => {
  const doc = {
    get: async () => {
      if (estado.lecturaFalla) throw new Error('firestore caido');
      return { exists: estado.documento !== null, data: () => estado.documento };
    },
    set: async (campos: any, opciones: any) => {
      estado.escrituras.push({ campos, opciones });
      estado.documento = { ...(estado.documento || {}), ...campos };
    },
  };
  return {
    db: { collection: () => ({ doc: () => doc }) },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
  };
});

import { signSession } from '@/lib/auth';
import { invalidarEstado } from '@/lib/api-guard';
import {
  CAMPOS_TITULAR,
  DATOS_VACIOS,
  camposQueFaltan,
  faltanDatosPorRellenar,
  normalizarDatos,
  validarDatos,
  valorParaMostrar,
} from '@/lib/datos-titular';
import { GET as leerRuta, PUT as guardarRuta } from '@/app/api/admin/datos-titular/route';
import { leerDatosTitular } from '@/lib/services/datos-titular';

const COMPLETOS = {
  razonSocial: 'Immobiliare Pantaleo S.r.l.',
  nombreComercial: 'Immobiliare Pantaleo',
  direccion: 'Via Roma 1, 91025 Marsala (TP), Italia',
  partitaIva: '01234567890',
  emailPrivacidad: 'privacy@immobiliarepantaleo.it',
  emailContacto: 'info@immobiliarepantaleo.it',
  telefono: '+39 0923 000000',
  foro: 'Marsala (TP)',
};

async function pedir(metodo: 'GET' | 'PUT', ruolo: string, cuerpo?: any) {
  const token = await signSession({ email: 'x@pantaleo.it', nome: 'X', ruolo } as any);
  const init: RequestInit = { method: metodo, headers: { cookie: `pantaleo_session=${token}` } };
  if (cuerpo !== undefined) {
    init.body = JSON.stringify(cuerpo);
    (init.headers as any)['Content-Type'] = 'application/json';
  }
  const req = new Request('http://localhost/api/admin/datos-titular', init);
  const res = metodo === 'GET' ? await leerRuta(req) : await guardarRuta(req);
  return { status: res.status, cuerpo: await res.json() };
}

beforeEach(() => {
  estado.documento = null;
  estado.escrituras = [];
  estado.lecturaFalla = false;
  revalidados.length = 0;
  // El guard cachea el estado vivo 30 s por email: sin esto, un caso
  // contaminaria al siguiente y los de rol degradado pasarian igualmente.
  invalidarEstado('x@pantaleo.it');
  audit.mockClear();
  obtenerUsuario.mockReset();
  obtenerUsuario.mockImplementation(async () => null as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('SOLO el propietario ve y edita los datos de la agencia', () => {
  it('un propietario puede leerlos', async () => {
    expect((await pedir('GET', 'propietario')).status).toBe(200);
  });

  it('una secretaria NO, aunque gestione datos de negocio', async () => {
    expect((await pedir('GET', 'secretaria')).status).toBe(403);
  });

  it('un vendedor y un agente tampoco', async () => {
    expect((await pedir('GET', 'vendedor')).status).toBe(403);
    expect((await pedir('GET', 'agente')).status).toBe(403);
  });

  it('y nadie por debajo de propietario puede ESCRIBIR', async () => {
    for (const ruolo of ['secretaria', 'vendedor', 'agente']) {
      const r = await pedir('PUT', ruolo, COMPLETOS);
      expect(r.status, `${ruolo} no deberia poder guardar`).toBe(403);
    }
    // Y lo que importa de verdad: no se escribio nada.
    expect(estado.escrituras).toEqual([]);
  });

  it('sin sesion, 401 y ni una escritura', async () => {
    const sinCookie = new Request('http://localhost/api/admin/datos-titular', {
      method: 'PUT',
      body: JSON.stringify(COMPLETOS),
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await guardarRuta(sinCookie)).status).toBe(401);
    expect(estado.escrituras).toEqual([]);
  });

  it('el rol VIVO manda: degradado en la base, se le cierra la puerta', async () => {
    // La cookie dice propietario porque se firmo antes de la degradacion.
    obtenerUsuario.mockImplementation(async () => ({
      id: 'x', email: 'x@pantaleo.it', nome: 'X', role: 'secretaria', status: 'attivo',
      mustResetPassword: false, tokenVersion: 1, createdAt: 0, updatedAt: 0,
    }) as any);
    expect((await pedir('PUT', 'propietario', COMPLETOS)).status).toBe(403);
    expect(estado.escrituras).toEqual([]);
  });

  it('un usuario bloqueado no entra ni a mirar', async () => {
    obtenerUsuario.mockImplementation(async () => ({
      id: 'x', email: 'x@pantaleo.it', nome: 'X', role: 'propietario', status: 'bloccato',
      mustResetPassword: false, tokenVersion: 1, createdAt: 0, updatedAt: 0,
    }) as any);
    expect((await pedir('GET', 'propietario')).status).toBe(403);
  });
});

describe('que campos faltan', () => {
  it('sin nada, faltan todos los obligatorios', () => {
    const obligatorios = CAMPOS_TITULAR.filter((c) => c.obligatorio).map((c) => c.clave);
    expect(camposQueFaltan(DATOS_VACIOS).sort()).toEqual([...obligatorios].sort());
  });

  it('los facultativos no cuentan como que faltan', () => {
    const soloObligatorios = { ...COMPLETOS, nombreComercial: '', foro: '' };
    expect(camposQueFaltan(soloObligatorios)).toEqual([]);
    expect(faltanDatosPorRellenar(soloObligatorios)).toBe(false);
  });

  it('un campo con solo espacios cuenta como vacio', () => {
    // Si no, se «completaria» el documento escribiendo un espacio.
    expect(camposQueFaltan({ ...COMPLETOS, partitaIva: '   ' })).toEqual(['partitaIva']);
  });

  it('completos, no falta ninguno', () => {
    expect(camposQueFaltan(COMPLETOS)).toEqual([]);
    expect(faltanDatosPorRellenar(COMPLETOS)).toBe(false);
  });
});

describe('lo que se pinta en la pagina publica', () => {
  it('un campo vacio sale como marcador legible, no como hueco', () => {
    // «...con sede in , P. IVA ...» parece correcto y no lo es.
    const v = valorParaMostrar(DATOS_VACIOS, 'direccion');
    expect(v).toContain('da completare');
    expect(v).not.toBe('');
  });

  it('y uno relleno sale tal cual', () => {
    expect(valorParaMostrar(COMPLETOS, 'razonSocial')).toBe('Immobiliare Pantaleo S.r.l.');
  });

  it('nunca se pinta «undefined»', () => {
    for (const campo of CAMPOS_TITULAR) {
      expect(valorParaMostrar({} as any, campo.clave)).not.toContain('undefined');
    }
  });
});

describe('validacion antes de guardar', () => {
  it('un correo mal escrito se rechaza', async () => {
    // Un correo roto en la informativa deja a un interesado sin poder ejercer
    // sus derechos, que es justo lo que la pagina le promete.
    const r = await pedir('PUT', 'propietario', { ...COMPLETOS, emailPrivacidad: 'no-es-un-correo' });
    expect(r.status).toBe(422);
    expect(r.cuerpo.errores.emailPrivacidad).toBeTruthy();
    expect(estado.escrituras).toEqual([]);
  });

  it('un obligatorio vacio se rechaza', async () => {
    const r = await pedir('PUT', 'propietario', { ...COMPLETOS, razonSocial: '' });
    expect(r.status).toBe(422);
    expect(r.cuerpo.errores.razonSocial).toBeTruthy();
  });

  it('un valor desmesurado se rechaza', () => {
    const errores = validarDatos({ ...COMPLETOS, direccion: 'x'.repeat(400) });
    expect(errores.direccion).toBeTruthy();
  });

  it('los facultativos vacios pasan sin problema', () => {
    expect(validarDatos({ ...COMPLETOS, nombreComercial: '', foro: '' })).toEqual({});
  });
});

describe('guardar', () => {
  it('escribe los datos y devuelve que no falta nada', async () => {
    const r = await pedir('PUT', 'propietario', COMPLETOS);
    expect(r.status).toBe(200);
    expect(r.cuerpo.faltan).toEqual([]);
    expect(estado.escrituras).toHaveLength(1);
    expect(estado.escrituras[0].campos.razonSocial).toBe('Immobiliare Pantaleo S.r.l.');
  });

  it('con merge: no reemplaza el documento entero', async () => {
    await pedir('PUT', 'propietario', COMPLETOS);
    expect(estado.escrituras[0].opciones).toEqual({ merge: true });
  });

  it('descarta cualquier clave que no sea de los datos', async () => {
    // Firestore acepta lo que le echen: sin esto, un cuerpo manipulado podria
    // meter campos arbitrarios en el documento de configuracion.
    await pedir('PUT', 'propietario', { ...COMPLETOS, _status: 'x', role: 'propietario', loQueSea: 1 });
    const escrito = estado.escrituras[0].campos;
    expect(escrito._status).toBeUndefined();
    expect(escrito.role).toBeUndefined();
    expect(escrito.loQueSea).toBeUndefined();
  });

  it('queda constancia de quien y de que campos, nunca de los valores', async () => {
    await pedir('PUT', 'propietario', COMPLETOS);
    expect(audit).toHaveBeenCalled();
    const entrada = audit.mock.calls[0][0] as any;
    expect(entrada.actorEmail).toBe('x@pantaleo.it');
    expect(entrada.action).toBe('config.datos_titular.update');
    expect(entrada.changedFields).toContain('razonSocial');
    // Los NOMBRES de los campos, no su contenido.
    expect(JSON.stringify(entrada)).not.toContain('01234567890');
  });

  it('solo se anotan los campos que de verdad cambiaron', async () => {
    estado.documento = { ...COMPLETOS };
    await pedir('PUT', 'propietario', { ...COMPLETOS, telefono: '+39 0923 999999' });
    const entrada = audit.mock.calls[0][0] as any;
    expect(entrada.changedFields).toEqual(['telefono']);
  });

  it('invalida el cache de las dos paginas publicas', async () => {
    await pedir('PUT', 'propietario', COMPLETOS);
    expect(revalidados).toContain('/privacy');
    expect(revalidados).toContain('/terms');
  });
});

describe('una lectura rota no puede tumbar las paginas publicas', () => {
  it('devuelve los campos vacios en vez de lanzar', async () => {
    // Si una caida de Firestore reventara /privacy, Google veria un error
    // donde espera la politica y rechazaria la publicacion de la app OAuth.
    estado.lecturaFalla = true;
    const r = await leerDatosTitular();
    expect(r.errorDeLectura).toBe(true);
    expect(r.datos).toEqual(DATOS_VACIOS);
  });

  it('y sin documento todavia, tampoco falla', async () => {
    estado.documento = null;
    const r = await leerDatosTitular();
    expect(r.existe).toBe(false);
    expect(r.errorDeLectura).toBe(false);
    expect(r.datos).toEqual(DATOS_VACIOS);
  });
});

describe('normalizar lo que venga de la base', () => {
  it('un documento al que le falte una clave da cadena vacia, no undefined', () => {
    const r = normalizarDatos({ razonSocial: 'Solo esto' });
    expect(r.telefono).toBe('');
    expect(Object.values(r).every((v) => typeof v === 'string')).toBe(true);
  });

  it('recorta los espacios y aguanta basura', () => {
    expect(normalizarDatos({ razonSocial: '  Pantaleo  ' }).razonSocial).toBe('Pantaleo');
    for (const basura of [null, undefined, 'texto', 42, []]) {
      expect(normalizarDatos(basura)).toEqual(DATOS_VACIOS);
    }
  });

  it('un valor que no sea texto no se cuela', () => {
    expect(normalizarDatos({ telefono: { $ne: null } }).telefono).toBe('');
  });
});
