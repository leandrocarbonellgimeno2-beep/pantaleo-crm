/**
 * Los datos de la agencia que aparecen en las páginas legales.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE FICHERO YA NO GUARDA LOS DATOS
 *
 * Antes eran constantes escritas a mano aquí, con marcadores tipo
 * «[RAGIONE SOCIALE]», y completarlos exigía tocar código y volver a
 * desplegar. Ahora viven en Firestore (`_config/datos_titular`) y Francesco
 * los edita desde Administración.
 *
 * Lo que queda aquí es lo que NO depende de la base de datos: la forma de los
 * datos, qué campos son obligatorios, cómo se llama cada uno en italiano —que
 * es lo que Francesco lee— y la regla que decide si el documento está
 * completo.
 *
 * Se mantiene PURO a propósito: sin Firestore y sin `async`. Así lo pueden
 * importar el formulario del navegador, las páginas públicas del servidor y
 * los tests, sin arrastrar el Admin SDK a ninguno de los tres.
 * La lectura y la escritura viven en `lib/services/datos-titular.ts`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ADVERTENCIA
 *
 * Los textos legales son una BASE redactada siguiendo el RGPD para una agencia
 * inmobiliaria; no son asesoramiento legal. Antes de publicarlos conviene que
 * los revise quien lleve la parte legal de la agencia.
 */

/** Las claves, en el orden en que se pintan en el formulario. */
export const CLAVES_TITULAR = [
  'razonSocial',
  'nombreComercial',
  'direccion',
  'partitaIva',
  'emailPrivacidad',
  'emailContacto',
  'telefono',
  'foro',
] as const;

export type ClaveTitular = (typeof CLAVES_TITULAR)[number];

export type DatosTitular = Record<ClaveTitular, string>;

export interface CampoTitular {
  clave: ClaveTitular;
  /** Lo que lee Francesco. En italiano: es su pantalla. */
  etiqueta: string;
  /** Una línea de ayuda debajo del campo. */
  ayuda: string;
  /**
   * Si su ausencia impide publicar. `foro` y `nombreComercial` no lo son: el
   * primero tiene un valor razonable por defecto y el segundo ya aparece en la
   * cabecera de las dos páginas.
   */
  obligatorio: boolean;
  /** Lo que se pinta en la página pública mientras el campo esté vacío. */
  marcador: string;
  /** `type` del input. */
  tipo: 'text' | 'email' | 'tel';
  ejemplo?: string;
}

export const CAMPOS_TITULAR: readonly CampoTitular[] = [
  {
    clave: 'razonSocial',
    etiqueta: 'Ragione sociale',
    ayuda: 'Denominazione completa della società, come risulta in visura.',
    obligatorio: true,
    marcador: '[Ragione sociale da completare]',
    tipo: 'text',
    ejemplo: 'Immobiliare Pantaleo S.r.l.',
  },
  {
    clave: 'nombreComercial',
    etiqueta: 'Nome commerciale',
    ayuda: 'Il nome con cui vi conoscono i clienti.',
    obligatorio: false,
    marcador: 'Immobiliare Pantaleo',
    tipo: 'text',
    ejemplo: 'Immobiliare Pantaleo',
  },
  {
    clave: 'direccion',
    etiqueta: 'Indirizzo della sede',
    ayuda: 'Via, numero civico, CAP, città e provincia.',
    obligatorio: true,
    marcador: '[Indirizzo da completare]',
    tipo: 'text',
    ejemplo: 'Via Roma 1, 91025 Marsala (TP), Italia',
  },
  {
    clave: 'partitaIva',
    etiqueta: 'Partita IVA / Codice Fiscale',
    ayuda: 'Obbligatoria nell’informativa privacy per identificare il titolare.',
    obligatorio: true,
    marcador: '[P. IVA da completare]',
    tipo: 'text',
    ejemplo: '01234567890',
  },
  {
    clave: 'emailPrivacidad',
    etiqueta: 'Email per le richieste privacy',
    ayuda: 'Dove arrivano le richieste di accesso, rettifica e cancellazione dei dati.',
    obligatorio: true,
    marcador: '[Email privacy da completare]',
    tipo: 'email',
    ejemplo: 'privacy@immobiliarepantaleo.it',
  },
  {
    clave: 'emailContacto',
    etiqueta: 'Email di contatto',
    ayuda: 'Indirizzo generale dell’agenzia.',
    obligatorio: true,
    marcador: '[Email di contatto da completare]',
    tipo: 'email',
    ejemplo: 'info@immobiliarepantaleo.it',
  },
  {
    clave: 'telefono',
    etiqueta: 'Telefono',
    ayuda: 'Numero pubblicato nelle pagine legali.',
    obligatorio: true,
    marcador: '[Telefono da completare]',
    tipo: 'tel',
    ejemplo: '+39 0923 000000',
  },
  {
    clave: 'foro',
    etiqueta: 'Foro competente',
    ayuda: 'Città del tribunale indicato nei Termini di Servizio.',
    obligatorio: false,
    marcador: 'Marsala (TP)',
    tipo: 'text',
    ejemplo: 'Marsala (TP)',
  },
] as const;

/** Todo vacío. Es lo que se usa cuando el documento todavía no existe. */
export const DATOS_VACIOS: DatosTitular = CLAVES_TITULAR.reduce(
  (acc, k) => ({ ...acc, [k]: '' }),
  {} as DatosTitular,
);

/** Fecha de la última revisión de los TEXTOS legales, no de los datos. */
export const ULTIMA_REVISION = '21 settembre 2026';

const limpio = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Normaliza cualquier cosa que venga de Firestore a la forma completa.
 *
 * Un documento al que le falte una clave —porque se guardó con una versión
 * anterior del formulario— tiene que dar cadena vacía en ese campo, no
 * `undefined`: `undefined` acabaría pintado como «undefined» en una página
 * pública.
 */
export function normalizarDatos(crudo: unknown): DatosTitular {
  const fuente = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  return CLAVES_TITULAR.reduce(
    (acc, k) => ({ ...acc, [k]: limpio(fuente[k]) }),
    {} as DatosTitular,
  );
}

/** Las claves obligatorias que siguen vacías. */
export function camposQueFaltan(datos: DatosTitular): ClaveTitular[] {
  return CAMPOS_TITULAR.filter((c) => c.obligatorio && !limpio(datos[c.clave])).map((c) => c.clave);
}

/** true mientras falte algún campo obligatorio. */
export function faltanDatosPorRellenar(datos: DatosTitular): boolean {
  return camposQueFaltan(datos).length > 0;
}

/**
 * El valor que hay que PINTAR para un campo.
 *
 * Si está vacío devuelve el marcador legible en vez de una cadena vacía: una
 * frase que dice «...con sede in , P. IVA ...» es peor que una que dice
 * «[Indirizzo da completare]», porque la primera parece correcta.
 */
export function valorParaMostrar(datos: DatosTitular, clave: ClaveTitular): string {
  const v = limpio(datos[clave]);
  if (v) return v;
  return CAMPOS_TITULAR.find((c) => c.clave === clave)?.marcador ?? '';
}

/**
 * Comprueba lo que llega del formulario antes de guardarlo.
 *
 * Devuelve los errores por campo, en italiano, porque van directos a la
 * pantalla de Francesco.
 */
export function validarDatos(datos: DatosTitular): Partial<Record<ClaveTitular, string>> {
  const errores: Partial<Record<ClaveTitular, string>> = {};

  for (const campo of CAMPOS_TITULAR) {
    const valor = limpio(datos[campo.clave]);

    if (campo.obligatorio && !valor) {
      errores[campo.clave] = 'Campo obbligatorio.';
      continue;
    }
    if (!valor) continue;

    if (valor.length > 300) {
      errores[campo.clave] = 'Massimo 300 caratteri.';
      continue;
    }
    // Un correo mal escrito en la informativa deja a un interesado sin poder
    // ejercer sus derechos, y eso es justo lo que la pagina promete.
    if (campo.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) {
      errores[campo.clave] = 'Indirizzo email non valido.';
    }
  }

  return errores;
}
