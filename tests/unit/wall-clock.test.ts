import { describe, it, expect } from 'vitest';
import { sumarMinutosAHoraDePared } from '@/lib/wall-clock';

describe('sumarMinutosAHoraDePared — aritmetica basica', () => {
  it('suma una hora', () => {
    expect(sumarMinutosAHoraDePared('2026-07-15', '10:00', 60)).toBe('2026-07-15T11:00:00');
  });

  it('suma minutos sueltos', () => {
    expect(sumarMinutosAHoraDePared('2026-07-15', '10:00', 30)).toBe('2026-07-15T10:30:00');
    expect(sumarMinutosAHoraDePared('2026-07-15', '10:45', 30)).toBe('2026-07-15T11:15:00');
  });

  it('cruza la medianoche cambiando el dia', () => {
    expect(sumarMinutosAHoraDePared('2026-07-15', '23:30', 60)).toBe('2026-07-16T00:30:00');
  });

  it('cruza el fin de mes', () => {
    expect(sumarMinutosAHoraDePared('2026-07-31', '23:00', 120)).toBe('2026-08-01T01:00:00');
  });

  it('cruza el fin de ano', () => {
    expect(sumarMinutosAHoraDePared('2026-12-31', '23:00', 90)).toBe('2027-01-01T00:30:00');
  });

  it('rellena con ceros a la izquierda', () => {
    expect(sumarMinutosAHoraDePared('2026-01-05', '09:05', 5)).toBe('2026-01-05T09:10:00');
  });
});

describe('sumarMinutosAHoraDePared — el punto del arreglo', () => {
  it('NO devuelve la hora en UTC ni lleva sufijo Z', () => {
    // Es justo lo que causaba el desfase: mandar la hora con offset propio
    // hacia que Google ignorara el campo timeZone.
    const r = sumarMinutosAHoraDePared('2026-07-15', '10:00', 60);
    expect(r.endsWith('Z')).toBe(false);
    expect(r).not.toContain('+');
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
  });

  it('da el mismo resultado en verano y en invierno', () => {
    // La hora de pared no depende del horario de verano: son las 10:00 en
    // enero y son las 10:00 en julio. Quien aplica la zona es Google.
    expect(sumarMinutosAHoraDePared('2026-01-15', '10:00', 60)).toBe('2026-01-15T11:00:00');
    expect(sumarMinutosAHoraDePared('2026-07-15', '10:00', 60)).toBe('2026-07-15T11:00:00');
  });

  it('no depende de la zona horaria del proceso', () => {
    // El servidor de Vercel va en UTC y una maquina de desarrollo en Madrid no.
    // El resultado tiene que ser identico en las dos.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const nuevaYork = sumarMinutosAHoraDePared('2026-07-15', '10:00', 60);
      process.env.TZ = 'UTC';
      const utc = sumarMinutosAHoraDePared('2026-07-15', '10:00', 60);
      expect(nuevaYork).toBe(utc);
      expect(utc).toBe('2026-07-15T11:00:00');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('sumarMinutosAHoraDePared — entradas invalidas', () => {
  it('lanza en vez de devolver una fecha con NaN', () => {
    // Antes, toISOString() sobre una fecha invalida lanzaba un RangeError
    // opaco. Aqui el mensaje dice que valores llegaron.
    expect(() => sumarMinutosAHoraDePared('no-es-fecha', '10:00', 60)).toThrow();
    expect(() => sumarMinutosAHoraDePared('2026-07-15', 'xx:yy', 60)).toThrow();
    expect(() => sumarMinutosAHoraDePared('', '', 60)).toThrow();
  });
});
