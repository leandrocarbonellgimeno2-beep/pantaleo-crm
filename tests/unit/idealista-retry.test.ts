import { describe, it, expect } from 'vitest';
import { isIdempotentMethod, shouldRetryStatus } from '@/lib/idealista-auth';

describe('isIdempotentMethod', () => {
  it('GET, PUT, DELETE y HEAD son repetibles', () => {
    for (const m of ['GET', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(isIdempotentMethod(m)).toBe(true);
    }
  });

  it('POST no lo es: crea recursos', () => {
    expect(isIdempotentMethod('POST')).toBe(false);
    expect(isIdempotentMethod('PATCH')).toBe(false);
  });

  it('sin metodo, fetch usa GET', () => {
    expect(isIdempotentMethod(undefined)).toBe(true);
    expect(isIdempotentMethod('')).toBe(true);
  });

  it('no distingue mayusculas', () => {
    expect(isIdempotentMethod('post')).toBe(false);
    expect(isIdempotentMethod('get')).toBe(true);
  });
});

describe('shouldRetryStatus — el arreglo del duplicado', () => {
  it('EL BUG: un 5xx en POST ya NO se reintenta', () => {
    // Un 502 o un 504 vienen de una pasarela y pueden significar que el
    // backend SI proceso la peticion y solo se perdio la respuesta.
    // Reintentar ahi duplicaba anuncios y contactos de pago.
    for (const s of [500, 502, 503, 504]) {
      expect(shouldRetryStatus(s, false)).toBe(false);
    }
  });

  it('un 5xx en un metodo idempotente si se sigue reintentando', () => {
    for (const s of [500, 502, 503, 504]) {
      expect(shouldRetryStatus(s, true)).toBe(true);
    }
  });

  it('429 se reintenta SIEMPRE, incluso en POST', () => {
    // Un rate limit significa que el servidor rechazo la peticion sin
    // procesarla: no creo nada, asi que repetirla es seguro.
    expect(shouldRetryStatus(429, false)).toBe(true);
    expect(shouldRetryStatus(429, true)).toBe(true);
  });

  it('los 4xx siguen sin reintentarse: son errores permanentes', () => {
    for (const s of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetryStatus(s, true)).toBe(false);
      expect(shouldRetryStatus(s, false)).toBe(false);
    }
  });

  it('las respuestas correctas no entran en la politica de reintento', () => {
    for (const s of [200, 201, 204, 304]) {
      expect(shouldRetryStatus(s, true)).toBe(false);
      expect(shouldRetryStatus(s, false)).toBe(false);
    }
  });

  it('600 no es 5xx', () => {
    expect(shouldRetryStatus(600, true)).toBe(false);
  });
});
