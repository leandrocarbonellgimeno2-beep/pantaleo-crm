import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createOAuthState, verifyOAuthState, OAUTH_STATE_TTL_MS } from '@/lib/oauth-state';
import { verifySession, signSession } from '@/lib/auth';

const SECRET = 'secreto-de-prueba-suficientemente-largo';

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('createOAuthState / verifyOAuthState — camino feliz', () => {
  it('un state recien creado valida con su nonce', async () => {
    const { state, nonce } = await createOAuthState();
    expect(await verifyOAuthState(state, nonce)).toBe(true);
  });

  it('cada llamada genera un nonce distinto', async () => {
    const a = await createOAuthState();
    const b = await createOAuthState();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.state).not.toBe(b.state);
  });

  it('el nonce no viaja dentro del state en claro', async () => {
    // Va dentro del payload firmado, no como texto plano concatenado.
    const { state, nonce } = await createOAuthState();
    expect(state.includes(nonce)).toBe(false);
  });
});

describe('verifyOAuthState — el ataque que cierra', () => {
  it('rechaza un state que no acompana al nonce correcto', async () => {
    // Es el CSRF: el atacante trae SU state, pero el navegador de la victima
    // lleva el nonce de OTRO flujo (o ninguno).
    const victima = await createOAuthState();
    const atacante = await createOAuthState();
    expect(await verifyOAuthState(atacante.state, victima.nonce)).toBe(false);
  });

  it('rechaza el state constante que se usaba antes', async () => {
    expect(await verifyOAuthState('default_admin', 'default_admin')).toBe(false);
  });

  it('rechaza si no hay cookie', async () => {
    const { state } = await createOAuthState();
    expect(await verifyOAuthState(state, null)).toBe(false);
    expect(await verifyOAuthState(state, undefined)).toBe(false);
    expect(await verifyOAuthState(state, '')).toBe(false);
  });

  it('rechaza si no hay state', async () => {
    const { nonce } = await createOAuthState();
    expect(await verifyOAuthState(null, nonce)).toBe(false);
    expect(await verifyOAuthState('', nonce)).toBe(false);
  });

  it('rechaza una firma manipulada', async () => {
    const { state, nonce } = await createOAuthState();
    const dot = state.lastIndexOf('.');
    const manipulado = state.substring(0, dot) + '.' + 'A'.repeat(state.length - dot - 1);
    expect(await verifyOAuthState(manipulado, nonce)).toBe(false);
  });

  it('rechaza un payload manipulado aunque se conserve la firma', async () => {
    const { state, nonce } = await createOAuthState();
    const dot = state.lastIndexOf('.');
    const otro = await createOAuthState();
    const otroDot = otro.state.lastIndexOf('.');
    // Payload de un flujo, firma de otro.
    const frankenstein = otro.state.substring(0, otroDot) + state.substring(dot);
    expect(await verifyOAuthState(frankenstein, nonce)).toBe(false);
  });

  it('rechaza basura y formatos raros', async () => {
    const { nonce } = await createOAuthState();
    for (const s of ['sin-punto', '.', '..', 'a.b', '%%%.%%%']) {
      expect(await verifyOAuthState(s, nonce)).toBe(false);
    }
  });

  it('rechaza un state caducado', async () => {
    const { state, nonce } = await createOAuthState();
    expect(await verifyOAuthState(state, nonce)).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + OAUTH_STATE_TTL_MS + 1000);
    expect(await verifyOAuthState(state, nonce)).toBe(false);
    vi.useRealTimers();
  });
});

describe('separacion de dominio criptografico', () => {
  it('un state NO vale como cookie de sesion', async () => {
    // verifySession no valida la forma del payload, solo la firma y el exp.
    // Sin el prefijo de dominio, un state firmado con el mismo secreto seria
    // una sesion valida, y el state circula por URLs e historiales.
    const { state } = await createOAuthState();
    expect(await verifySession(state)).toBeNull();
  });

  it('una cookie de sesion NO vale como state', async () => {
    const token = await signSession({ email: 'a@b.c', nome: 'Test', ruolo: 'admin' });
    // Ni siquiera conociendo el nonce, porque la sesion no lo contiene.
    expect(await verifyOAuthState(token, 'cualquier-nonce')).toBe(false);
  });
});
