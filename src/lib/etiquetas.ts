/**
 * Cómo se llama una persona y cómo se llama un inmueble, venga el documento de
 * donde venga.
 *
 * POR QUE HACE FALTA. Los buscadores del CRM apuntan a rutas que devuelven
 * FORMAS DISTINTAS, y varios estaban leyendo campos que en esa forma no
 * existen. Como leer un campo ausente en JavaScript no falla —da `undefined`—
 * el error no se veía en ninguna consola: se veía en la pantalla, y solo si
 * mirabas.
 *
 *   /api/proprietari  ->  { nome, cognome, cell1, ... }        plano
 *   /api/clienti      ->  { DatiPersonali: { Nome, ... }, ... } anidado
 *   /api/immobili     ->  { DatiBase: { Indirizzo, ... }, ... } anidado
 *
 * El buscador de personas de la agenda escribía `${p.nome} ${p.cognome}` para
 * las dos: acertaba con los propietarios y guardaba **«undefined undefined»**
 * como nombre de la cita cuando era un cliente. El de inmuebles leía
 * `i.indirizzo`, que tampoco existe, así que pintaba filas EN BLANCO y al
 * elegir una escribía cadena vacía en la dirección, borrando lo que el agente
 * hubiera escrito a mano.
 *
 * Los clientes heredados sí tienen `nome`/`cognome` sueltos en el primer
 * nivel, y por eso la lista los proyecta: las funciones de abajo miran primero
 * la forma canónica y luego la heredada, en ese orden.
 */

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Nombre para enseñar y para guardar. Cadena vacía si no hay ninguno. */
export function nombrePersona(p: any): string {
  if (!p || typeof p !== 'object') return '';
  const dp = p.DatiPersonali || {};
  const nombre = texto(dp.Nome) || texto(p.nome) || texto(p.Nome) || texto(p.NomeCompleto) || texto(p.nominativo);
  const apellido = texto(dp.Cognome) || texto(p.cognome) || texto(p.Cognome) || texto(p.surname);
  return [nombre, apellido].filter(Boolean).join(' ');
}

/** El primer teléfono que tenga, mirando las dos formas. */
export function telefonoPersona(p: any): string {
  if (!p || typeof p !== 'object') return '';
  const dp = p.DatiPersonali || {};
  return (
    texto(dp.Telefono) || texto(dp.Cellulare) ||
    texto(p.cell1) || texto(p.cellulare) || texto(p.Cellulare) ||
    texto(p.telefono) || texto(p.Telefono) || texto(p.tel1) ||
    ''
  );
}

/**
 * Dirección del inmueble para enseñar y para guardar.
 *
 * Si no hay dirección cae a ciudad y zona, que es lo que distingue una ficha
 * heredada sin `Indirizzo` de una fila vacía. Devolver algo reconocible
 * importa: esto acaba escrito en la cita.
 */
export function direccionInmueble(i: any): string {
  if (!i || typeof i !== 'object') return '';
  const db = i.DatiBase || {};
  const directa = texto(db.Indirizzo) || texto(i.indirizzo) || texto(i.titolo);
  if (directa) return directa;
  const lugar = [texto(db.Citta) || texto(i.citta), texto(db.Zona) || texto(i.zona)]
    .filter(Boolean)
    .join(' — ');
  return lugar;
}

/** Referencia visible del inmueble: «RIF 1001». Cadena vacía si no la hay. */
export function refInmueble(i: any): string {
  if (!i || typeof i !== 'object') return '';
  const db = i.DatiBase || {};
  return texto(db.Riferimento) || texto(db.Codice) || texto(i.rif) || texto(i.codice) || '';
}
