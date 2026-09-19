import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// firebase-admin lanza al importarse si faltan credenciales, asi que aqui se
// sustituye entero. Es la unica forma de cubrir la rama "encontrado", que en
// runtime solo se puede probar contra la base de datos real.
const mockGet = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: () => ({
      doc: () => ({ get: mockGet, create: mockCreate }),
    }),
  },
}));

import { buscarUsuario, migrarUsuarioDesdeLegacy, userDocId } from '@/lib/services/users';

const docValido = {
  email: 'mario@example.it',
  nome: 'Mario',
  role: 'amministratore',
  passwordHash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  status: 'attivo',
  mustResetPassword: false,
  tokenVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'migrazione-automatica',
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockGet.mockReset();
  mockCreate.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('userDocId', () => {
  it('normaliza a minusculas, porque Firestore distingue y el JSON no', () => {
    // Sin esto, entrar como Mario@X.it y como mario@x.it crearia DOS
    // documentos para la misma persona.
    expect(userDocId('Mario.Rossi@Example.IT')).toBe('mario.rossi@example.it');
    expect(userDocId('  mario@x.it  ')).toBe('mario@x.it');
  });

  it('un email con barra no puede escribir en una subcoleccion', () => {
    expect(() => userDocId('a/b@x.it')).toThrow();
  });
});

describe('buscarUsuario — los TRES estados', () => {
  it('encontrado: devuelve el usuario con el rol normalizado', () => {
    mockGet.mockResolvedValue({ exists: true, data: () => docValido });
    return buscarUsuario('mario@example.it').then((r) => {
      expect(r.estado).toBe('encontrado');
      if (r.estado !== 'encontrado') return;
      expect(r.usuario.role).toBe('admin');
      expect(r.usuario.status).toBe('attivo');
      expect(r.usuario.passwordHash).toBe(docValido.passwordHash);
    });
  });

  it('no-existe: el documento no esta', async () => {
    mockGet.mockResolvedValue({ exists: false });
    expect((await buscarUsuario('nadie@example.it')).estado).toBe('no-existe');
  });

  it('ERROR y no "no-existe" cuando Firestore falla', async () => {
    // Es la distincion que sostiene toda la migracion. Si un fallo de
    // infraestructura se tradujera a "no existe", el login intentaria migrar
    // sobre un documento que quiza ya existe, pisando un hash mas nuevo con la
    // contrasena vieja del JSON.
    mockGet.mockRejectedValue(new Error('UNAVAILABLE'));
    expect((await buscarUsuario('mario@example.it')).estado).toBe('error');
  });

  it('un email invalido como id tambien acaba en error, no en no-existe', async () => {
    expect((await buscarUsuario('a/b@x.it')).estado).toBe('error');
  });

  it('un documento SIN hash se trata como no migrado, para que el JSON rescate', async () => {
    // Un documento a medias no debe bloquear el acceso de nadie.
    mockGet.mockResolvedValue({ exists: true, data: () => ({ ...docValido, passwordHash: undefined }) });
    expect((await buscarUsuario('mario@example.it')).estado).toBe('no-existe');
  });

  it('status bloccato se conserva; cualquier otro valor cuenta como activo', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ ...docValido, status: 'bloccato' }) });
    const r = await buscarUsuario('mario@example.it');
    expect(r.estado === 'encontrado' && r.usuario.status).toBe('bloccato');

    mockGet.mockResolvedValue({ exists: true, data: () => ({ ...docValido, status: 'lo-que-sea' }) });
    const r2 = await buscarUsuario('mario@example.it');
    expect(r2.estado === 'encontrado' && r2.usuario.status).toBe('attivo');
  });

  it('un rol desconocido en el documento degrada, no rompe', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ ...docValido, role: 'jefe-supremo' }) });
    const r = await buscarUsuario('mario@example.it');
    expect(r.estado === 'encontrado' && r.usuario.role).toBe('agente');
  });
});

describe('migrarUsuarioDesdeLegacy — nunca puede tumbar un login', () => {
  const params = {
    email: 'Mario@Example.IT',
    nome: 'Mario',
    ruolo: 'amministratore',
    passwordHash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  };

  it('escribe el documento con el email y el rol normalizados', async () => {
    mockCreate.mockResolvedValue(undefined);
    await migrarUsuarioDesdeLegacy(params);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const escrito = mockCreate.mock.calls[0][0];
    expect(escrito.email).toBe('mario@example.it');
    expect(escrito.role).toBe('admin');
    expect(escrito.status).toBe('attivo');
    expect(escrito.tokenVersion).toBe(1);
    expect(escrito.createdBy).toBe('migrazione-automatica');
  });

  it('NO lanza si la escritura falla: el usuario ya demostro quien es', async () => {
    mockCreate.mockRejectedValue(new Error('UNAVAILABLE'));
    await expect(migrarUsuarioDesdeLegacy(params)).resolves.toBeUndefined();
  });

  it('dos pestanas a la vez: ALREADY_EXISTS se ignora en silencio', async () => {
    // create() y no set(): la segunda pestana choca en vez de pisar el
    // documento que acaba de crear la primera.
    const e: any = new Error('Document already exists');
    e.code = 6;
    mockCreate.mockRejectedValue(e);
    await expect(migrarUsuarioDesdeLegacy(params)).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });
});
