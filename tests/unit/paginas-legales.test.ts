import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { urlDelSitio, DOMINIO_POR_DEFECTO } from '@/lib/site-url';
import { TITULAR, faltanDatosPorRellenar } from '@/lib/datos-titular';

/**
 * Las dos paginas legales existen para poder PUBLICAR la aplicacion OAuth de
 * Google. Mientras no este publicada, el refresh_token del calendario caduca
 * cada siete dias — que es, muy probablemente, lo que paso el 20 de marzo.
 *
 * Google las visita desde su propia infraestructura, sin ninguna cookie. Si el
 * proxy las mandara a /login, veria una redireccion en vez de la politica y
 * rechazaria la publicacion. Por eso lo que se fija aqui es sobre todo que
 * sean PUBLICAS.
 */

const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('las dos paginas se sirven SIN sesion', () => {
  const proxy = leer('src/proxy.ts');

  it('/privacy y /terms estan en las rutas publicas del proxy', () => {
    const bloque = proxy.match(/const PUBLIC_PATHS = \[([^\]]*)\]/);
    expect(bloque, 'no encuentro PUBLIC_PATHS en el proxy').toBeTruthy();
    expect(bloque![1]).toContain("'/privacy'");
    expect(bloque![1]).toContain("'/terms'");
  });

  it('y el login sigue siendo publico: no se ha roto nada al añadirlas', () => {
    const bloque = proxy.match(/const PUBLIC_PATHS = \[([^\]]*)\]/)!;
    expect(bloque[1]).toContain("'/login'");
    expect(bloque[1]).toContain("'/api/auth'");
  });

  it('el proxy deja pasar las rutas publicas antes de mirar la cookie', () => {
    // Si la comprobacion de sesion fuera antes, la ruta publica no serviria de
    // nada. El orden importa y por eso se comprueba.
    const iPublic = proxy.indexOf('if (isPublicPath');
    const iCookie = proxy.indexOf("request.cookies.get('pantaleo_session')");
    expect(iPublic).toBeGreaterThan(-1);
    expect(iCookie).toBeGreaterThan(-1);
    expect(iPublic).toBeLessThan(iCookie);
  });

  it('ninguna de las dos es un componente de cliente ni pide datos', () => {
    // Son texto. Si alguna llevara "use client" o un fetch, dejaria de poder
    // servirse a un visitante sin sesion.
    for (const ruta of ['src/app/privacy/page.tsx', 'src/app/terms/page.tsx']) {
      const fuente = leer(ruta);
      expect(fuente, `${ruta} no deberia ser componente de cliente`).not.toContain('"use client"');
      expect(fuente, `${ruta} no deberia pedir datos`).not.toContain('fetch(');
    }
  });
});

describe('el contenido que Google va a revisar', () => {
  const privacy = leer('src/app/privacy/page.tsx');
  const terms = leer('src/app/terms/page.tsx');

  it('la privacidad declara QUE datos de Google se usan y para que', () => {
    // Es lo que mira el revisor de Google al publicar la app.
    expect(privacy).toContain('auth/calendar');
    expect(privacy).toContain('auth/userinfo.email');
    expect(privacy).toMatch(/Google Calendar/);
  });

  it('y dice expresamente que no se usan para publicidad ni se ceden', () => {
    // El JSX parte las frases en varias lineas, asi que se compara sobre el
    // texto con los espacios normalizados y sin etiquetas.
    const texto = privacy.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(texto).toMatch(/pubblicit/i);
    expect(texto).toMatch(/non vengono venduti/i);
    expect(texto).toMatch(/intelligenza artificiale/i);
  });

  it('cubre los puntos que el RGPD exige', () => {
    for (const punto of [
      'Titolare del trattamento',
      'Finalità e basi giuridiche',
      'Periodo di conservazione',
      'Diritti dell',
      'garanteprivacy.it',
    ]) {
      expect(privacy, `falta el apartado: ${punto}`).toContain(punto);
    }
  });

  it('los terminos cubren acceso, uso, responsabilidad y foro', () => {
    for (const punto of ['Account e credenziali', 'Uso consentito', 'Limitazione di responsabilità', 'foro']) {
      expect(terms, `falta el apartado: ${punto}`).toContain(punto);
    }
  });

  it('las dos enlazan entre si y salen del mismo sitio de datos', () => {
    expect(terms).toContain('/privacy');
    for (const fuente of [privacy, terms]) {
      expect(fuente).toContain('@/lib/datos-titular');
    }
  });

  it('el login enlaza las dos, que es la unica pantalla visible sin sesion', () => {
    const login = leer('src/app/login/page.tsx');
    expect(login).toContain('href="/privacy"');
    expect(login).toContain('href="/terms"');
  });
});

describe('los datos de la agencia estan pendientes, y se avisa', () => {
  it('hoy siguen siendo marcadores', () => {
    // Si esto falla es que ya se rellenaron: cambia la expectativa.
    expect(faltanDatosPorRellenar()).toBe(true);
    expect(TITULAR.razonSocial).toMatch(/^\[/);
  });

  it('con marcadores, las paginas pintan el aviso de «da completare»', () => {
    const marco = leer('src/components/legal/PaginaLegale.tsx');
    expect(marco).toContain('faltanDatosPorRellenar');
    expect(marco).toContain('Documento da completare');
  });

  it('rellenarlos apaga el aviso', () => {
    expect(faltanDatosPorRellenar({
      razonSocial: 'Immobiliare Pantaleo S.r.l.',
      nombreComercial: 'Immobiliare Pantaleo',
      direccion: 'Via Roma 1, 91025 Marsala (TP)',
      partitaIva: '01234567890',
      emailPrivacidad: 'privacy@pantaleo.it',
      emailContacto: 'info@pantaleo.it',
      telefono: '+39 0923 000000',
      foro: 'Marsala (TP)',
    })).toBe(false);
  });
});

describe('el dominio sale de la variable de entorno, no escrito a mano', () => {
  it('el de por defecto es el nuevo', () => {
    expect(DOMINIO_POR_DEFECTO).toBe('https://sistema-immobiliare-pantaleo.vercel.app');
  });

  it('manda NEXT_PUBLIC_APP_URL, que es la que hay puesta en Vercel', () => {
    // El codigo leia NEXT_PUBLIC_SITE_URL, que no existe: por eso caia SIEMPRE
    // al valor escrito a mano y cambiarlo en Vercel no habria servido de nada.
    const antesApp = process.env.NEXT_PUBLIC_APP_URL;
    const antesSite = process.env.NEXT_PUBLIC_SITE_URL;
    try {
      process.env.NEXT_PUBLIC_APP_URL = 'https://nuevo.example.com';
      process.env.NEXT_PUBLIC_SITE_URL = 'https://viejo.example.com';
      expect(urlDelSitio()).toBe('https://nuevo.example.com');
    } finally {
      if (antesApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = antesApp;
      if (antesSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = antesSite;
    }
  });

  it('se quita la barra final, para no componer rutas con doble barra', () => {
    const antes = process.env.NEXT_PUBLIC_APP_URL;
    try {
      process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo.com/';
      expect(urlDelSitio()).toBe('https://ejemplo.com');
      expect(`${urlDelSitio()}/immobili`).toBe('https://ejemplo.com/immobili');
    } finally {
      if (antes === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = antes;
    }
  });

  it('sin variable ninguna, cae al dominio actual y no a uno muerto', () => {
    const a = process.env.NEXT_PUBLIC_APP_URL;
    const b = process.env.NEXT_PUBLIC_SITE_URL;
    try {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.NEXT_PUBLIC_SITE_URL;
      expect(urlDelSitio()).toBe(DOMINIO_POR_DEFECTO);
    } finally {
      if (a !== undefined) process.env.NEXT_PUBLIC_APP_URL = a;
      if (b !== undefined) process.env.NEXT_PUBLIC_SITE_URL = b;
    }
  });
});

describe('no queda ningun dominio viejo escrito a mano', () => {
  it('ni en el codigo ni en los documentos', () => {
    const sospechosos = [
      'src/app/clienti/page.tsx',
      'src/lib/site-url.ts',
      'src/app/privacy/page.tsx',
      'src/app/terms/page.tsx',
      'docs/adr/0003-calendario-bidireccional-con-google.md',
      'vercel.json',
    ];
    for (const ruta of sospechosos) {
      const fuente = leer(ruta);
      expect(fuente, `${ruta} sigue nombrando un dominio viejo`).not.toContain('pantaleo-crm.vercel.app');
      expect(fuente, `${ruta} sigue nombrando un dominio viejo`).not.toContain('hola-2026');
    }
  });
});
