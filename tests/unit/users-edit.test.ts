import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockTxGet = vi.fn();
const mockTxUpdate = vi.fn();
const mockCountGet = vi.fn();
const mockDocGet = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: () => ({
      doc: () => ({ get: mockDocGet, __ref: true }),
      where: () => ({
        where: () => ({ count: () => ({ get: mockCountGet }) }),
      }),
    }),
    runTransaction: async (cb: any) => cb({ get: mockTxGet, update: mockTxUpdate }),
  },
}));

import {
  actualizarUsuario,
  contarPropietariosActivos,
  validarPassword,
  PASSWORD_MIN,
} from '@/lib/services/users';

const existente = {
  email: 'mario@x.it',
  nome: 'Mario',
  role: 'vendedor',
  passwordHash: 'scrypt$viejo',
  status: 'attivo',
  mustResetPassword: false,
  tokenVersion: 3,
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'jefe@x.it',
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockTxGet.mockReset();
  mockTxUpdate.mockReset();
  mockCountGet.mockReset();
  mockDocGet.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('actualizarUsuario — revocacion de sesiones', () => {
  it('SUBE tokenVersion al cambiar el rol', async () => {
    // La cookie lleva el rol dentro y dura ocho horas. Sin subir esta version,
    // degradar a alguien no tendria efecto hasta que su sesion caducara.
    mockTxGet.mockResolvedValue({ exists: true, data: () => existente });
    await actualizarUsuario('mario@x.it', { role: 'agente' });
    expect(mockTxUpdate.mock.calls[0][1].tokenVersion).toBe(4);
  });

  it('SUBE tokenVersion al bloquear', async () => {
    mockTxGet.mockResolvedValue({ exists: true, data: () => existente });
    await actualizarUsuario('mario@x.it', { status: 'bloccato' });
    expect(mockTxUpdate.mock.calls[0][1].tokenVersion).toBe(4);
  });

  it('SUBE tokenVersion al cambiar la contrasena', async () => {
    mockTxGet.mockResolvedValue({ exists: true, data: () => existente });
    await actualizarUsuario('mario@x.it', { passwordHash: 'scrypt$nuevo' });
    expect(mockTxUpdate.mock.calls[0][1].tokenVersion).toBe(4);
  });

  it('NO la sube por un cambio que no afecta al acceso', async () => {
    // Marcar "debe cambiar la contrasena" no es motivo para echar a nadie de
    // su sesion.
    mockTxGet.mockResolvedValue({ exists: true, data: () => existente });
    await actualizarUsuario('mario@x.it', { mustResetPassword: true });
    expect(mockTxUpdate.mock.calls[0][1].tokenVersion).toBeUndefined();
  });

  it('parte de 1 si el documento no tenia tokenVersion', async () => {
    mockTxGet.mockResolvedValue({ exists: true, data: () => ({ ...existente, tokenVersion: undefined }) });
    await actualizarUsuario('mario@x.it', { status: 'bloccato' });
    expect(mockTxUpdate.mock.calls[0][1].tokenVersion).toBe(2);
  });
});

describe('actualizarUsuario — comportamiento general', () => {
  it('solo escribe los campos pedidos', async () => {
    mockTxGet.mockResolvedValue({ exists: true, data: () => existente });
    await actualizarUsuario('mario@x.it', { role: 'secretaria' });
    const escrito = mockTxUpdate.mock.calls[0][1];
    expect(escrito.role).toBe('secretaria');
    expect(escrito.status).toBeUndefined();
    expect(escrito.passwordHash).toBeUndefined();
    expect(escrito.updatedAt).toBeGreaterThan(0);
  });

  it('no inventa un usuario que no existe', async () => {
    mockTxGet.mockResolvedValue({ exists: false });
    const r = await actualizarUsuario('nadie@x.it', { role: 'agente' });
    expect(r.ok).toBe(false);
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it('el resultado nunca incluye el hash', async () => {
    mockTxGet.mockResolvedValue({ exists: true, data: () => existente });
    const r = await actualizarUsuario('mario@x.it', { passwordHash: 'scrypt$SECRETO' });
    expect(JSON.stringify(r)).not.toContain('SECRETO');
  });
});

describe('contarPropietariosActivos', () => {
  it('cuenta con agregacion, sin descargar documentos', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 2 }) });
    expect(await contarPropietariosActivos()).toBe(2);
  });

  it('devuelve cero cuando no queda ninguno', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });
    expect(await contarPropietariosActivos()).toBe(0);
  });
});

describe('validarPassword', () => {
  it('acepta a partir del minimo', () => {
    expect(validarPassword('x'.repeat(PASSWORD_MIN)).ok).toBe(true);
  });

  it('rechaza por debajo del minimo y lo que no es texto', () => {
    expect(validarPassword('x'.repeat(PASSWORD_MIN - 1)).ok).toBe(false);
    expect(validarPassword('').ok).toBe(false);
    expect(validarPassword(null).ok).toBe(false);
    expect(validarPassword(12345678901).ok).toBe(false);
  });

  it('rechaza una desmesurada', () => {
    expect(validarPassword('x'.repeat(201)).ok).toBe(false);
  });
});
