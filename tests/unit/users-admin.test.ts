import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreate = vi.fn();
const mockListGet = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: () => ({
      doc: () => ({ create: mockCreate, get: vi.fn() }),
      limit: () => ({ get: mockListGet }),
    }),
  },
}));

import {
  validarNuevoUsuario,
  listarUsuarios,
  crearUsuario,
  PASSWORD_MIN,
} from '@/lib/services/users';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockCreate.mockReset();
  mockListGet.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('validarNuevoUsuario — entradas validas', () => {
  it('acepta un alta correcta y normaliza email y rol', () => {
    const r = validarNuevoUsuario({
      email: '  Mario.Rossi@Example.IT ',
      nome: '  Mario Rossi  ',
      password: 'una-password-larga',
      role: ' VENDEDOR ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.email).toBe('mario.rossi@example.it');
    expect(r.datos.nome).toBe('Mario Rossi');
    expect(r.datos.role).toBe('vendedor');
  });

  it('los cuatro roles son validos', () => {
    for (const role of ['propietario', 'secretaria', 'vendedor', 'agente']) {
      const r = validarNuevoUsuario({ email: 'a@b.it', nome: 'X', password: 'x'.repeat(PASSWORD_MIN), role });
      expect(r.ok).toBe(true);
    }
  });

  it('NO recorta la contrasena', () => {
    // Un espacio al final forma parte de la contrasena. Recortarla aqui haria
    // que el alta y el login no coincidieran, y el usuario no podria entrar
    // con la contrasena que le acaban de dar.
    const p = ' con espacios al borde ';
    const r = validarNuevoUsuario({ email: 'a@b.it', nome: 'X', password: p, role: 'agente' });
    expect(r.ok && r.datos.password).toBe(p);
  });
});

describe('validarNuevoUsuario — entradas rechazadas', () => {
  const base = { email: 'a@b.it', nome: 'X', password: 'x'.repeat(PASSWORD_MIN), role: 'agente' };

  it('email ausente o con formato imposible', () => {
    for (const email of ['', '   ', 'sin-arroba', 'a@b', '@b.it', 'a@.it', null, 42]) {
      expect(validarNuevoUsuario({ ...base, email }).ok).toBe(false);
    }
  });

  it('un email con barra no puede llegar a ser id de documento', () => {
    expect(validarNuevoUsuario({ ...base, email: 'a/b@c.it' }).ok).toBe(false);
  });

  it('nombre vacio o desmesurado', () => {
    expect(validarNuevoUsuario({ ...base, nome: '   ' }).ok).toBe(false);
    expect(validarNuevoUsuario({ ...base, nome: 'x'.repeat(121) }).ok).toBe(false);
  });

  it('contrasena por debajo del minimo', () => {
    expect(validarNuevoUsuario({ ...base, password: 'x'.repeat(PASSWORD_MIN - 1) }).ok).toBe(false);
    expect(validarNuevoUsuario({ ...base, password: '' }).ok).toBe(false);
  });

  it('UN ROL DESCONOCIDO ES UN ERROR, no se degrada en silencio', () => {
    // Es la diferencia con normalizeRole, que degrada. En un alta manual, un
    // rol mal escrito tiene que verse: degradarlo daria de alta a alguien con
    // un nivel distinto del que el administrador creia estar concediendo.
    const r = validarNuevoUsuario({ ...base, role: 'admin' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('propietario');
  });

  it('rol vacio o de otro tipo', () => {
    expect(validarNuevoUsuario({ ...base, role: '' }).ok).toBe(false);
    expect(validarNuevoUsuario({ ...base, role: null }).ok).toBe(false);
  });
});

describe('listarUsuarios', () => {
  it('NUNCA devuelve el passwordHash', () => {
    mockListGet.mockResolvedValue({
      docs: [
        {
          id: 'b@x.it',
          data: () => ({ email: 'b@x.it', nome: 'B', role: 'vendedor', passwordHash: 'scrypt$SECRETO' }),
        },
      ],
    });
    return listarUsuarios().then((u) => {
      expect(u).toHaveLength(1);
      expect(JSON.stringify(u)).not.toContain('SECRETO');
      expect('passwordHash' in u[0]).toBe(false);
    });
  });

  it('ordena por email', async () => {
    mockListGet.mockResolvedValue({
      docs: [
        { id: 'z@x.it', data: () => ({ email: 'z@x.it', role: 'agente' }) },
        { id: 'a@x.it', data: () => ({ email: 'a@x.it', role: 'agente' }) },
      ],
    });
    const u = await listarUsuarios();
    expect(u.map((x) => x.email)).toEqual(['a@x.it', 'z@x.it']);
  });
});

describe('crearUsuario', () => {
  const params = {
    email: 'Nuevo@Example.IT',
    nome: 'Nuevo',
    role: 'vendedor' as const,
    passwordHash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
    createdBy: 'jefe@example.it',
  };

  it('crea el documento y devuelve el usuario sin el hash', async () => {
    mockCreate.mockResolvedValue(undefined);
    const r = await crearUsuario(params);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usuario.email).toBe('nuevo@example.it');
    expect(r.usuario.createdBy).toBe('jefe@example.it');
    expect(JSON.stringify(r.usuario)).not.toContain('scrypt');
  });

  it('EMAIL DUPLICADO devuelve un resultado, no pisa al usuario existente', async () => {
    // Con set() en vez de create(), dar de alta un email que ya existe le
    // cambiaria la contrasena y el rol al usuario actual sin avisar a nadie.
    const e: any = new Error('Document already exists');
    e.code = 6;
    mockCreate.mockRejectedValue(e);
    const r = await crearUsuario(params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('duplicado');
  });

  it('un error de infraestructura SI se propaga', async () => {
    // Al contrario que en la migracion invisible: aqui hay un administrador
    // mirando la pantalla y tiene que enterarse de que el alta no se guardo.
    mockCreate.mockRejectedValue(new Error('UNAVAILABLE'));
    await expect(crearUsuario(params)).rejects.toThrow('UNAVAILABLE');
  });
});
