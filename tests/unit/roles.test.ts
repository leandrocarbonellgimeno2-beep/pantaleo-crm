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
    expect(normalizeRole('  SECRETARIA ')).toBe('secretaria');
    expect(normalizeRole('Propietario')).toBe('propietario');
    expect(normalizeRole('read_only')).toBe('agente');
    expect(normalizeRole('sola lettura')).toBe('agente');
  });

  it('los nombres viejos siguen mapeando al nivel correcto', () => {
    // Las sesiones ya emitidas llevan dentro el valor antiguo y tienen que
    // seguir funcionando hasta que caduquen.
    expect(normalizeRole('master')).toBe('propietario');
    expect(normalizeRole('admin')).toBe('secretaria');
    expect(normalizeRole('amministratore')).toBe('secretaria');
    expect(normalizeRole('utente')).toBe('vendedor');
    expect(normalizeRole('lectura')).toBe('agente');
  });
});

describe('LA TRAMPA DEL NOMBRE: agente es el nivel mas BAJO', () => {
  it('agente es solo lectura, no el nivel intermedio', () => {
    // En una inmobiliaria un agente es quien vende, y en la version anterior
    // de este modulo "agente" era efectivamente el nivel medio. Aqui NO.
    // Quien lo asuma al reves le quitara permisos a alguien sin enterarse.
    expect(hasAtLeast('agente', 'vendedor')).toBe(false);
    expect(hasAtLeast('agente', 'secretaria')).toBe(false);
    expect(hasAtLeast('agente', 'propietario')).toBe(false);
    expect(hasAtLeast('agente', 'agente')).toBe(true);
  });

  it('el que vende es vendedor, y ese si esta por encima de agente', () => {
    expect(hasAtLeast('vendedor', 'agente')).toBe(true);
    expect(normalizeRole('venditore')).toBe('vendedor');
    expect(normalizeRole('agente-comercial')).toBe('vendedor');
  });
});

describe('normalizeRole — lo desconocido', () => {
  it('un valor no reconocido degrada al rol por defecto, no revienta', () => {
    expect(normalizeRole('rol-que-nadie-ha-visto')).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole('')).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole(null)).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole(undefined)).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole(42)).toBe(ROL_POR_DEFECTO);
    expect(normalizeRole({})).toBe(ROL_POR_DEFECTO);
  });

  it('el rol por defecto puede trabajar pero no administrar', () => {
    expect(hasAtLeast(ROL_POR_DEFECTO, 'agente')).toBe(true);
    expect(hasAtLeast(ROL_POR_DEFECTO, 'vendedor')).toBe(true);
    expect(hasAtLeast(ROL_POR_DEFECTO, 'secretaria')).toBe(false);
    expect(hasAtLeast(ROL_POR_DEFECTO, 'propietario')).toBe(false);
  });

  it('avisa por consola con el valor concreto que no reconocio', () => {
    normalizeRole('supervisor-regional');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('supervisor-regional'),
    );
  });
});

describe('hasAtLeast — la jerarquia', () => {
  it('propietario alcanza cualquier nivel', () => {
    for (const r of ROLES) expect(hasAtLeast('propietario', r)).toBe(true);
  });

  it('cada rol se alcanza a si mismo', () => {
    for (const r of ROLES) expect(hasAtLeast(r, r)).toBe(true);
  });

  it('secretaria gestiona la agencia pero no es propietario', () => {
    expect(hasAtLeast('secretaria', 'vendedor')).toBe(true);
    expect(hasAtLeast('secretaria', 'agente')).toBe(true);
    expect(hasAtLeast('secretaria', 'propietario')).toBe(false);
  });

  it('vendedor trabaja pero no administra', () => {
    expect(hasAtLeast('vendedor', 'agente')).toBe(true);
    expect(hasAtLeast('vendedor', 'vendedor')).toBe(true);
    expect(hasAtLeast('vendedor', 'secretaria')).toBe(false);
    expect(hasAtLeast('vendedor', 'propietario')).toBe(false);
  });

  it('un rol basura no se cuela como administrador', () => {
    expect(hasAtLeast('rol-inventado', 'secretaria')).toBe(false);
    expect(hasAtLeast(null, 'secretaria')).toBe(false);
    expect(hasAtLeast(undefined, 'propietario')).toBe(false);
  });
});

describe('la reja de la pestaña de administración del home', () => {
  // El home lo carga TODO el mundo. La pestaña «Amministrazione» se pinta con
  // hasAtLeast(ruolo, 'propietario'), y este test fija esa frontera: si alguien
  // toca la tabla de niveles, aquí se entera antes de que un vendedor vea el
  // panel de usuarios.
  //
  // Que quede claro: esto NO es la seguridad. La barrera está en el servidor,
  // en /api/admin/*, que comprueba el rol contra el token firmado en cada
  // petición. Esto solo decide si se enseña la puerta.
  const veLaPestana = (ruolo: unknown) => hasAtLeast(ruolo as any, 'propietario');

  it('solo el propietario la ve', () => {
    expect(veLaPestana('propietario')).toBe(true);
    expect(veLaPestana('secretaria')).toBe(false);
    expect(veLaPestana('vendedor')).toBe(false);
    expect(veLaPestana('agente')).toBe(false);
  });

  it('sin rol, sin pestaña', () => {
    // sessionData?.ruolo llega como undefined mientras la sesión está en vuelo
    // y si la petición falla. El modo de fallo tiene que ser cerrado.
    for (const v of [undefined, null, '', 'lo que sea', 0, {}]) {
      expect(veLaPestana(v)).toBe(false);
    }
  });

  it('los alias heredados también se resuelven', () => {
    // normalizeRole traduce master -> propietario, así que una cookie antigua
    // firmada con «master» sigue viendo lo que le toca.
    expect(veLaPestana(normalizeRole('master'))).toBe(true);
    expect(veLaPestana(normalizeRole('admin'))).toBe(false);
  });
});
