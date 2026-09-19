import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeRole, hasAtLeast, ROL_POR_DEFECTO, ROLES } from '@/lib/roles';

beforeEach(() => {
  // normalizeRole avisa por consola de los valores que no reconoce: es la via
  // para descubrir que roles hay de verdad en produccion. Aqui se silencia.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeRole — valores canonicos', () => {
  it('los cuatro roles se reconocen tal cual', () => {
    for (const r of ROLES) {
      expect(normalizeRole(r)).toBe(r);
    }
  });

  it('ignora mayusculas, espacios y separadores', () => {
    expect(normalizeRole('  ADMIN ')).toBe('admin');
    expect(normalizeRole('Master')).toBe('master');
    expect(normalizeRole('read_only')).toBe('lectura');
    expect(normalizeRole('sola lettura')).toBe('lectura');
  });

  it('reconoce los alias en italiano, espanol e ingles', () => {
    expect(normalizeRole('amministratore')).toBe('admin');
    expect(normalizeRole('administrador')).toBe('admin');
    expect(normalizeRole('utente')).toBe('agente');
    expect(normalizeRole('usuario')).toBe('agente');
    expect(normalizeRole('titolare')).toBe('master');
    expect(normalizeRole('viewer')).toBe('lectura');
  });
});

describe('normalizeRole — lo desconocido', () => {
  it('un valor no reconocido degrada al rol por defecto, no revienta', () => {
    // No puedo leer AUTH_USERS_JSON (Vercel lo marca Sensitive), asi que la
    // lista de alias se ha escrito a ciegas. Un valor raro tiene que degradar
    // a algo previsible, nunca lanzar ni dejar a nadie sin trabajar.
    expect(normalizeRole('rol-que-nadie-ha-visto')).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole('')).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole(null)).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole(undefined)).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole(42)).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole({})).toBe(ROL_POR_DEFECTO);
  });

  it('el rol por defecto NO es el mas alto: lo desconocido nunca da administracion', () => {
    expect(hasAtLeast(ROL_POR_DEFECTO, 'admin')).toBe(false);
    expect(hasAtLeast(ROL_POR_DEFECTO, 'master')).toBe(false);
  });

  it('avisa por consola con el valor concreto que no reconocio', () => {
    normalizeRole('supervisor-regional');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('supervisor-regional'),
    );
  });
});

describe('hasAtLeast — la jerarquia', () => {
  it('master alcanza cualquier nivel', () => {
    for (const r of ROLES) expect(hasAtLeast('master', r)).toBe(true);
  });

  it('cada rol se alcanza a si mismo', () => {
    for (const r of ROLES) expect(hasAtLeast(r, r)).toBe(true);
  });

  it('admin llega a agente y lectura, pero no a master', () => {
    expect(hasAtLeast('admin', 'agente')).toBe(true);
    expect(hasAtLeast('admin', 'lectura')).toBe(true);
    expect(hasAtLeast('admin', 'master')).toBe(false);
  });

  it('agente no administra', () => {
    expect(hasAtLeast('agente', 'lectura')).toBe(true);
    expect(hasAtLeast('agente', 'agente')).toBe(true);
    expect(hasAtLeast('agente', 'admin')).toBe(false);
    expect(hasAtLeast('agente', 'master')).toBe(false);
  });

  it('lectura no alcanza nada por encima de si mismo', () => {
    expect(hasAtLeast('lectura', 'lectura')).toBe(true);
    expect(hasAtLeast('lectura', 'agente')).toBe(false);
    expect(hasAtLeast('lectura', 'admin')).toBe(false);
    expect(hasAtLeast('lectura', 'master')).toBe(false);
  });

  it('un rol basura no se cuela como administrador', () => {
    // Lo importante de la degradacion: quita permisos, nunca los anade.
    expect(hasAtLeast('rol-inventado', 'admin')).toBe(false);
    expect(hasAtLeast(null, 'admin')).toBe(false);
    expect(hasAtLeast(undefined, 'master')).toBe(false);
  });
});
