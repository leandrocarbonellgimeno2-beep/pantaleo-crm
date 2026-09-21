/**
 * Reconstruye `immobili_collegati` de los propietarios cuyo vinculo se perdio.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUE PASO
 *
 * `GET /api/proprietari` fabrica `immobili_collegati: Array(n).fill('id')` para
 * pintar las tarjetas del listado. La ficha de propietario reenviaba ese
 * relleno en el PATCH, y Firestore se quedaba con `['id','id']` en lugar de los
 * IDs reales. Cada guardado de una ficha destruia el vinculo
 * proprietario -> immobili.
 *
 * El codigo ya no lo hace: `numero_immobili` e `immobili_collegati` salieron de
 * PROPRIETARI_ALLOWED en `c4950cd`, asi que `sanitizeBody` los descarta. Este
 * script repara lo que quedo dañado ANTES de ese arreglo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ES UNA RECONSTRUCCION Y NO UNA ADIVINANZA
 *
 * El vinculo esta guardado DOS VECES, en las dos direcciones:
 *
 *     proprietari/{id}.immobili_collegati   ->  [ids de inmuebles]
 *     immobili/{id}.proprietarioId          ->  id del propietario
 *
 * Las dos las escribe la misma transaccion (`proprietari/[id]/immobili`):
 * vincular hace `arrayUnion(propertyId)` y ademas pone `proprietarioId` en el
 * inmueble; desvincular hace `arrayRemove` y ademas BORRA `proprietarioId`.
 *
 * El relleno solo corrompio la direccion del propietario. La direccion inversa
 * —`immobili.proprietarioId`— nunca se toco, y es la que usa de verdad todo el
 * CRM: el contador del listado, el recuento de `proprietari-counter.ts` y la
 * pestaña «Immobili» de la ficha salen todos de ella.
 *
 * Asi que no se infiere nada: se copia el dato que sigue intacto al campo que
 * se perdio.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUE HACE Y QUE NO HACE
 *
 *   SI  escribe `immobili_collegati` en los propietarios cuyo array es relleno.
 *       Ese campo y solo ese.
 *
 *   NO  borra ni un documento.
 *   NO  toca `numero_immobili`: ya esta bien en los 17 (comprobado), lo
 *       mantiene `recountProprietario` y el GET lo recalcula al pintar.
 *   NO  toca la coleccion `immobili`. Solo la LEE.
 *   NO  toca un propietario cuyo array tenga IDs reales, salvo que se lo pidas
 *       con --incluir-desincronizados.
 *   NO  deja un array vacio: si un propietario dañado no tiene ni un inmueble,
 *       se SALTA y se avisa, en vez de escribir [].
 *
 * ════════════════════════════════════════════════════════════════════════════
 * USO
 *
 *   node scripts/reparar-vinculos-propietarios.cjs             <- solo mira
 *   node scripts/reparar-vinculos-propietarios.cjs --force     <- repara
 *
 *   --incluir-desincronizados   repara ademas los que no son relleno pero
 *                               tienen el array incompleto (ver el informe)
 *
 * Es IDEMPOTENTE: al terminar no queda nada dañado, y volver a lanzarlo no
 * escribe nada.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const FORZAR = process.argv.includes('--force');
const INCLUIR_DESINCRONIZADOS = process.argv.includes('--incluir-desincronizados');
const RAIZ = path.join(__dirname, '..');

/** El valor que fabricaba el GET y que la ficha reenviaba. */
const RELLENO = 'id';

// ════════════════════════════════════════════════════════════════════════════
// Comprobaciones previas. Si alguna falla, el script no se ejecuta.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Que la fuga este cerrada ANTES de reparar.
 *
 * Si `immobili_collegati` sigue en la whitelist, la proxima vez que alguien
 * abra y guarde una ficha vuelve a escribirse el relleno encima: reparar
 * seria barrer con el grifo abierto, y encima daria la impresion de que el
 * problema esta resuelto.
 */
function comprobarQueLaFugaEstaCerrada() {
  const fuente = fs.readFileSync(path.join(RAIZ, 'src/lib/sanitize.ts'), 'utf8');
  const bloque = fuente.match(/export const PROPRIETARI_ALLOWED = \[([\s\S]*?)\] as const;/);
  if (!bloque) {
    throw new Error('No encuentro PROPRIETARI_ALLOWED en sanitize.ts. No sigo a ciegas.');
  }
  // Fuera los comentarios ANTES de mirar nada: el comentario que explica el
  // fallo NOMBRA los dos campos, asi que sin esto la comprobacion se
  // dispararia sola.
  //
  // `[^\n\r]*` y no `.*$`: el fichero esta en CRLF, y en `.*$` sin la bandera
  // `m` el punto no casa `\r` y el `$` exige fin de CADENA, de modo que el
  // comentario no se quitaba. Se veia: el `'id'` del comentario acababa en la
  // lista de claves permitidas.
  const sinComentarios = bloque[1]
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n\r]*/g, ' ');

  const claves = (sinComentarios.match(/['"`]([A-Za-z0-9_]+)['"`]/g) || [])
    .map((c) => c.slice(1, -1));

  // Si el analisis se rompe, no se da por buena la respuesta.
  //
  // Esta comprobacion existe para decir que NO hay que seguir; una que falle
  // en silencio y devuelva cero claves diria «todo en orden» justo cuando
  // menos se sabe. La lista tiene del orden de 40 claves: mucho menos que eso
  // significa que lo que falla es el analisis.
  if (claves.length < 20) {
    throw new Error(
      'No he podido leer PROPRIETARI_ALLOWED: solo reconoci ' + claves.length + ' claves.\n' +
      'Abortado: sin poder comprobar que la fuga esta cerrada, no se repara.',
    );
  }

  // Las comillas pueden ser simples, dobles o invertidas: mirar solo un estilo
  // daria un FALSO NEGATIVO —«fuga cerrada»— si alguien reintrodujera el campo
  // con otro, que es el peor error posible en esta funcion.
  const reabiertas = ['immobili_collegati', 'numero_immobili'].filter((c) => claves.includes(c));
  if (reabiertas.length) {
    throw new Error(
      'PROPRIETARI_ALLOWED vuelve a aceptar: ' + reabiertas.join(', ') + '\n' +
      'Guardar una ficha volveria a escribir el relleno encima de lo reparado.\n' +
      'Abortado: primero hay que cerrar la fuga (ver el commit c4950cd).',
    );
  }
}

/**
 * Que el GET siga fabricando el relleno.
 *
 * No es un problema —es lo que pinta el contador—, pero si algun dia deja de
 * hacerlo, el criterio que este script usa para reconocer un registro dañado
 * («el array son cadenas 'id'») podria estar desfasado, y conviene mirarlo
 * antes de escribir.
 */
function avisarSiElGetYaNoFabricaElRelleno() {
  const fuente = fs.readFileSync(path.join(RAIZ, 'src/app/api/proprietari/route.ts'), 'utf8');
  if (!/immobili_collegati\s*=\s*Array\(realCount\)\.fill\('id'\)/.test(fuente)) {
    console.log('AVISO: /api/proprietari ya no fabrica `Array(n).fill(\'id\')`.');
    console.log('       El criterio de «dañado» de este script se escribio para ESE relleno.');
    console.log('       Revisa el informe de abajo con mas atencion de lo normal.');
    console.log('');
  }
}

// ════════════════════════════════════════════════════════════════════════════

function cargarEnv() {
  const ruta = path.join(RAIZ, '.env.local');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

/** Como se clasifica el array actual de un propietario. */
function clasificar(array) {
  // «No hay campo» y «hay campo pero no es un array» NO son lo mismo, y
  // meterlos en el mismo saco escondia una corrupcion de otra forma —un
  // escalar, un null, un objeto— entre los 696 que el informe presenta como
  // «sin el campo». En un script cuyo trabajo es medir el daño antes de tocar
  // nada, eso es justo lo que no puede pasar desapercibido.
  if (array === undefined) return 'sin-campo';
  if (!Array.isArray(array)) return 'forma-invalida';
  if (array.length === 0) return 'vacio';
  const relleno = array.filter((x) => x === RELLENO).length;
  if (relleno === array.length) return 'danado';      // solo relleno
  if (relleno > 0) return 'danado-parcial';           // relleno mezclado con IDs reales
  return 'con-ids-reales';
}

const ordenado = (a) => [...a].sort();
const mismosIds = (a, b) => ordenado(a).join(' ') === ordenado(b).join(' ');

(async () => {
  comprobarQueLaFugaEstaCerrada();
  cargarEnv();
  avisarSiElGetYaNoFabricaElRelleno();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en .env.local');
  }

  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  const db = admin.firestore();

  console.log('Proyecto: ' + projectId);
  console.log('Modo:     ' + (FORZAR ? '*** REPARANDO DE VERDAD (--force) ***' : 'SOLO RECUENTO (dry-run)'));
  if (INCLUIR_DESINCRONIZADOS) console.log('Alcance:  dañados + desincronizados (--incluir-desincronizados)');
  console.log('');
  console.log('Leyendo la relacion inversa immobili.proprietarioId…');

  // ── 1. La direccion que sobrevivio: inmueble -> propietario ──────────────
  //
  // Se proyectan tres campos: son 870 documentos y de cada uno hacen falta
  // esos valores. `proprietarioId_real` no se usa para reconstruir, pero se
  // trae para comprobar que no contradice a `proprietarioId` (ver abajo).
  const [conteoInmuebles, immSnap] = await Promise.all([
    db.collection('immobili').count().get(),
    db.collection('immobili').select('proprietarioId', 'proprietarioId_real', '_status').get(),
  ]);

  // COMPROBACION 1: que la lectura no se haya truncado.
  //
  // Es el fallo mas peligroso que puede tener este script y el mas silencioso:
  // si la lectura devolviera menos inmuebles de los que hay, la reconstruccion
  // saldria INCOMPLETA y escribiria arrays a los que les faltan vinculos, que
  // es exactamente el daño que viene a reparar. El recuento del servidor
  // (`count()`) se calcula aparte de la lectura, asi que sirve de testigo
  // independiente.
  if (conteoInmuebles.data().count !== immSnap.size) {
    throw new Error(
      'La lectura de `immobili` no cuadra con el recuento del servidor:\n' +
      '  count() dice ' + conteoInmuebles.data().count + ' y la lectura trajo ' + immSnap.size + '.\n' +
      'Abortado: reconstruir con una lectura incompleta escribiria vinculos a medias.',
    );
  }

  const porPropietario = new Map();     // id propietario -> [ids de inmueble]
  const borradosPorPropietario = new Map();
  const contradicen = [];               // proprietarioId != proprietarioId_real

  for (const d of immSnap.docs) {
    const pid = d.data().proprietarioId;

    // COMPROBACION 2: los dos campos de vinculo tienen que decir lo mismo.
    //
    // Vincular escribe `proprietarioId` y `proprietarioId_real` con el mismo
    // valor, y desvincular borra los dos. Pero los dos estan en
    // IMMOBILI_ALLOWED, asi que un PATCH podria haberlos separado. Si eso
    // hubiera pasado, cual de los dos manda deja de ser evidente y este script
    // no es quien para decidirlo.
    //
    // Comprobado hoy contra los datos: 870 de 870 coinciden, ninguno difiere,
    // ninguno tiene solo uno de los dos.
    const real = d.data().proprietarioId_real;
    const tienePid = typeof pid === 'string' && pid;
    const tieneReal = typeof real === 'string' && real;
    if ((tienePid || tieneReal) && pid !== real) {
      contradicen.push({ inmueble: d.id, proprietarioId: pid ?? null, proprietarioId_real: real ?? null });
    }

    if (typeof pid !== 'string' || !pid) continue;
    if (!porPropietario.has(pid)) porPropietario.set(pid, []);
    porPropietario.get(pid).push(d.id);

    // Los soft-borrados SE INCLUYEN, y es deliberado: soft-borrar un inmueble
    // NO hace arrayRemove —solo lo hace el desvinculado explicito—, asi que en
    // un registro sano seguirian dentro del array. Se cuentan aparte para que
    // el informe los enseñe: hoy no hay ninguno, pero si mañana lo hay,
    // conviene verlo antes de escribir.
    if (d.data()._status === 'pendente_cancellazione') {
      if (!borradosPorPropietario.has(pid)) borradosPorPropietario.set(pid, []);
      borradosPorPropietario.get(pid).push(d.id);
    }
  }

  if (contradicen.length) {
    throw new Error(
      contradicen.length + ' inmuebles tienen `proprietarioId` y `proprietarioId_real` distintos.\n' +
      contradicen.slice(0, 10).map((c) =>
        '  ' + c.inmueble + ': ' + c.proprietarioId + ' vs ' + c.proprietarioId_real).join('\n') +
      (contradicen.length > 10 ? '\n  …y ' + (contradicen.length - 10) + ' mas' : '') +
      '\nAbortado: cual de los dos manda deja de ser evidente, y este script no\n' +
      'es quien para decidirlo. Habia que revisarlo a mano.',
    );
  }

  console.log('  ' + immSnap.size + ' inmuebles leidos (cuadra con count()), ' +
    porPropietario.size + ' propietarios referenciados.');
  console.log('  proprietarioId y proprietarioId_real coinciden en todos.');
  console.log('');
  console.log('Revisando la coleccion proprietari…');

  // ── 2. Estado actual de cada propietario ─────────────────────────────────
  const [conteoPropietarios, propSnap] = await Promise.all([
    db.collection('proprietari').count().get(),
    db.collection('proprietari')
      .select('immobili_collegati', 'numero_immobili', '_status', 'nome', 'cognome')
      .get(),
  ]);

  // Mismo testigo independiente que con los inmuebles. Aqui truncar no
  // escribiria nada malo —solo dejaria algun dañado sin reparar—, pero el
  // informe diria «reparados 17 de 17» cuando en realidad faltaban.
  if (conteoPropietarios.data().count !== propSnap.size) {
    throw new Error(
      'La lectura de `proprietari` no cuadra con el recuento del servidor:\n' +
      '  count() dice ' + conteoPropietarios.data().count + ' y la lectura trajo ' + propSnap.size + '.\n' +
      'Abortado: el informe daria por revisados propietarios que no se miraron.',
    );
  }

  const plan = [];              // lo que se repararia
  const saltados = [];          // dañados que NO se tocan, con su motivo
  const desincronizados = [];   // no dañados, pero el array no cuadra
  const formaInvalida = [];     // el campo existe y NO es un array
  const recuento = {
    'sin-campo': 0, 'forma-invalida': 0, vacio: 0,
    danado: 0, 'danado-parcial': 0, 'con-ids-reales': 0,
  };

  for (const d of propSnap.docs) {
    const datos = d.data();
    const actual = datos.immobili_collegati;
    const clase = clasificar(actual);
    recuento[clase]++;
    if (clase === 'sin-campo') continue;

    const reconstruido = ordenado(porPropietario.get(d.id) || []);
    const nombre = [datos.nome, datos.cognome].filter(Boolean).join(' ') || '(sin nombre)';
    const comun = {
      id: d.id,
      nombre,
      actual,
      reconstruido,
      numero_immobili: datos.numero_immobili,
      soft_borrados: borradosPorPropietario.get(d.id) || [],
      _status: datos._status || null,
    };

    if (clase === 'forma-invalida') {
      // Se enseña y NO se repara: no hay forma determinista de saber que
      // habia ahi antes, y este script no adivina.
      formaInvalida.push({ ...comun, crudo: JSON.stringify(actual) });
      continue;
    }

    if (clase === 'danado' || clase === 'danado-parcial') {
      if (reconstruido.length === 0) {
        // Escribir [] seria correcto —el contenido actual es basura— pero
        // dejar un array vacio es indistinguible de «este propietario no tiene
        // inmuebles», y eso ya no se podria revisar despues. Se salta.
        saltados.push({ ...comun, motivo: 'no tiene ni un inmueble que referenciar' });
      } else {
        plan.push({ ...comun, clase });
      }
      continue;
    }

    // Ni relleno ni vacio-con-inmuebles: mirar si cuadra igualmente.
    if (!mismosIds(Array.isArray(actual) ? actual : [], reconstruido)) {
      desincronizados.push(comun);
    }
  }

  // ── 3. Informe ───────────────────────────────────────────────────────────
  console.log('  ' + propSnap.size + ' propietarios leidos.');
  console.log('');
  console.log('ESTADO DE immobili_collegati');
  console.log('  sin el campo ....................... ' + recuento['sin-campo']);
  console.log('  con IDs reales ..................... ' + recuento['con-ids-reales']);
  console.log('  array vacio [] ..................... ' + recuento.vacio);
  console.log('  DAÑADO, solo relleno ............... ' + recuento.danado);
  console.log('  DAÑADO, relleno mezclado con IDs ... ' + recuento['danado-parcial']);
  console.log('  el campo existe y NO es un array ... ' + recuento['forma-invalida']);
  console.log('');

  /** Lo que queda pendiente y no se va a tocar en esta pasada. */
  function contarPendientes() {
    const sinTocar = INCLUIR_DESINCRONIZADOS ? 0 : desincronizados.length;
    return sinTocar + saltados.length + formaInvalida.length;
  }

  /** Estos tres bloques se imprimen SIEMPRE, tambien cuando no hay nada que reparar. */
  function informarDeLoQueNoSeToca() {
    if (saltados.length) {
      console.log('NO SE TOCAN, aunque estan dañados (' + saltados.length + '):');
      for (const s of saltados) {
        console.log('  ' + s.id + '  ' + s.nombre + '  — ' + s.motivo);
        console.log('      se quedan como estan: ' + JSON.stringify(s.actual));
      }
      console.log('');
    }

    if (formaInvalida.length) {
      console.log('EL CAMPO EXISTE Y NO ES UN ARRAY (' + formaInvalida.length + '):');
      console.log('No se reparan: no hay forma determinista de saber que habia ahi.');
      for (const f of formaInvalida) {
        console.log('  ' + f.id + '  ' + f.nombre + '  valor: ' + f.crudo);
      }
      console.log('');
    }

    if (desincronizados.length && !INCLUIR_DESINCRONIZADOS) {
      console.log('ADEMAS, ' + desincronizados.length + ' propietarios NO dañados tienen el array');
      console.log('desincronizado con la relacion inversa. No son de este arreglo —su array');
      console.log('tiene IDs reales, no relleno— asi que por defecto no se tocan:');
      console.log('');
      for (const x of desincronizados) {
        console.log('  ' + x.id + '  ' + x.nombre);
        console.log('      ahora:    ' + JSON.stringify(x.actual));
        console.log('      deberia:  ' + JSON.stringify(x.reconstruido));
      }
      console.log('');
      console.log('Para repararlos tambien: --incluir-desincronizados');
      console.log('');
    }
  }

  // Los desincronizados, los saltados y los de forma invalida se recalculan en
  // CADA pasada y siguen ahi despues de un --force correcto. Antes este bloque
  // salia antes de enseñarlos, asi que la pasada de verificacion que piden las
  // instrucciones imprimia «Nada que reparar. Los vinculos estan bien.» con
  // cuatro registros pendientes y sin nombrar ni uno.
  const aEscribir = INCLUIR_DESINCRONIZADOS
    ? [...plan, ...desincronizados.map((x) => ({ ...x, clase: 'desincronizado' }))]
    // Los desincronizados pasan por la MISMA guarda que los dañados: si la
    // relacion inversa esta vacia, escribir [] borraria IDs reales. Antes esa
    // guarda solo cubria el plan, asi que este camino —el de la bandera que yo
    // mismo recomiendo usar— podia vaciar un array con contenido de verdad.
      .filter((x) => {
        if (x.reconstruido.length > 0) return true;
        saltados.push({ ...x, motivo: 'desincronizado y sin ningun inmueble que referenciar' });
        return false;
      })
    : plan;

  if (aEscribir.length === 0) {
    const pendientes = contarPendientes();
    console.log(pendientes === 0
      ? 'Nada que reparar. Los vinculos estan bien.'
      : 'Nada DAÑADO que reparar. Quedan ' + pendientes + ' registros sin tocar, abajo.');
    console.log('');
    informarDeLoQueNoSeToca();
    process.exit(0);
  }

  console.log('SE REPARARIAN ' + aEscribir.length + ' PROPIETARIOS');
  console.log('');
  for (const p of aEscribir) {
    console.log('  ' + p.id + '  ' + p.nombre);
    console.log('      ahora:     ' + JSON.stringify(p.actual));
    console.log('      quedaria:  ' + JSON.stringify(p.reconstruido));
    console.log('      numero_immobili guardado: ' + p.numero_immobili +
      (p.numero_immobili === p.reconstruido.length ? '  (coincide, no se toca)' : '  (NO coincide — ver aviso abajo)'));
    if (p.soft_borrados.length) {
      console.log('      OJO: ' + p.soft_borrados.length + ' de esos inmuebles estan soft-borrados: ' +
        JSON.stringify(p.soft_borrados));
    }
    if (p._status) console.log('      OJO: este propietario tiene _status=' + p._status);
    console.log('');
  }

  const descuadrados = aEscribir.filter((p) => p.numero_immobili !== p.reconstruido.length);
  if (descuadrados.length) {
    console.log('AVISO: en ' + descuadrados.length + ' de ellos `numero_immobili` no coincide con');
    console.log('       la cuenta reconstruida. Este script NO toca ese campo: lo mantiene');
    console.log('       recountProprietario y el listado lo recalcula al pintar.');
    console.log('');
  }

  informarDeLoQueNoSeToca();

  // ── 4. Dry-run termina aqui ──────────────────────────────────────────────
  if (!FORZAR) {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('DRY-RUN: no se ha escrito NADA.');
    console.log('');
    console.log('Para reparar de verdad:');
    console.log('    node scripts/reparar-vinculos-propietarios.cjs --force');
    console.log('');
    console.log('Solo se escribe el campo immobili_collegati, y solo en los');
    console.log('propietarios de la lista de arriba. Ningun inmueble se toca.');
    console.log('──────────────────────────────────────────────────────────────');
    process.exit(0);
  }

  // ── 5. Escritura ─────────────────────────────────────────────────────────
  console.log('Reparando…');
  console.log('');

  const registro = [];
  let reparados = 0;
  let omitidosPorCambio = 0;
  let conError = 0;

  // ────────────────────────────────────────────────────────────────────────
  // EL REGISTRO SE ABRE ANTES DE TOCAR NADA, Y SE ESCRIBE SOBRE LA MARCHA.
  //
  // Antes el volcado se escribia de una sola vez DESPUES del bucle. Si la
  // novena escritura fallaba —un corte de red, un DEADLINE_EXCEEDED, unas
  // credenciales rotadas—, la excepcion salia del bucle, se saltaba el
  // volcado entero y el script decia «ABORTADO» a secas: ocho propietarios
  // modificados en produccion y ni una linea en disco de cuales. Justo en el
  // unico escenario en el que ese registro hace falta.
  //
  // Es tambien lo que ya hacia bien el script hermano de los tokens; aqui se
  // habia perdido por el camino.
  const carpeta = path.join(RAIZ, 'scripts/volcados');
  fs.mkdirSync(carpeta, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = path.join(carpeta, 'reparacion-vinculos-' + marca + '.json');

  const guardarRegistro = () => {
    try {
      fs.writeFileSync(destino, JSON.stringify({
        fecha: new Date().toISOString(),
        proyecto: projectId,
        incluirDesincronizados: INCLUIR_DESINCRONIZADOS,
        previstos: aEscribir.length,
        reparados,
        omitidosPorCambio,
        conError,
        saltados: saltados.map((s) => ({ id: s.id, motivo: s.motivo, actual: s.actual })),
        formaInvalida: formaInvalida.map((f) => ({ id: f.id, valor: f.crudo })),
        detalle: registro,
      }, null, 2));
    } catch (e) {
      console.error('  AVISO: no se pudo escribir el registro en disco: ' + e.message);
    }
  };

  for (const p of aEscribir) {
    const ref = db.collection('proprietari').doc(p.id);
    try {

    // Se vuelve a leer JUSTO ANTES de escribir.
    //
    // Entre el recuento y esta linea alguien puede haber vinculado un inmueble
    // desde el CRM, y un arrayUnion suyo se perderia al escribir la lista
    // entera. Si el documento ya no esta como estaba, se deja en paz y se
    // avisa: relanzar el script lo recoge en la siguiente vuelta.
      const fresco = await ref.get();
      if (!fresco.exists) {
        omitidosPorCambio++;
        registro.push({ id: p.id, resultado: 'omitido', motivo: 'el documento ya no existe' });
        console.log('  OMITIDO ' + p.id + ' — el documento ya no existe');
        guardarRegistro();
        continue;
      }

      const ahora = fresco.data().immobili_collegati;
      if (JSON.stringify(ahora) !== JSON.stringify(p.actual)) {
        omitidosPorCambio++;
        registro.push({
          id: p.id, resultado: 'omitido',
          motivo: 'el array cambio desde el recuento',
          vistoEnElRecuento: p.actual, ahora,
        });
        console.log('  OMITIDO ' + p.id + ' — el array cambio desde el recuento');
        guardarRegistro();
        continue;
      }

      // Un solo campo. `update` y no `set`: `set` sin merge reemplazaria el
      // documento entero y se llevaria por delante el resto de la ficha.
      await ref.update({ immobili_collegati: p.reconstruido });

      reparados++;
      registro.push({
        id: p.id, nombre: p.nombre, resultado: 'reparado',
        antes: p.actual, despues: p.reconstruido,
      });
      console.log('  OK ' + p.id + '  ' + p.nombre + '  ' +
        JSON.stringify(p.actual) + ' -> ' + JSON.stringify(p.reconstruido));

      // Despues de CADA escritura, no al final: asi el fichero refleja lo que
      // hay en produccion aunque la siguiente vuelta se caiga.
      guardarRegistro();
    } catch (e) {
      // Un fallo en un propietario no tumba la pasada entera: se anota, se
      // guarda y se sigue. Los demas estan sanos y no hay ninguna invariante
      // entre ellos que obligue a pararlo todo.
      conError++;
      registro.push({ id: p.id, nombre: p.nombre, resultado: 'error', motivo: e.message });
      console.error('  ERROR ' + p.id + '  ' + p.nombre + ' — ' + e.message);
      guardarRegistro();

      // Pero si fallan tres seguidos, algo pasa con la conexion o con los
      // permisos y seguir solo alarga el estropicio.
      const ultimos = registro.slice(-3);
      if (ultimos.length === 3 && ultimos.every((r) => r.resultado === 'error')) {
        console.error('');
        console.error('  Tres errores seguidos: paro aqui. Mira el registro y relanza.');
        break;
      }
    }
  }

  // ── 6. Cierre ────────────────────────────────────────────────────────────
  guardarRegistro();

  console.log('');
  console.log('Reparados:  ' + reparados + ' de ' + aEscribir.length);
  if (omitidosPorCambio) console.log('Omitidos:   ' + omitidosPorCambio + ' (cambiaron desde el recuento)');
  if (conError) console.log('Con error:  ' + conError);
  console.log('Registro:   ' + destino);
  console.log('');
  console.log('Relanzalo sin --force para comprobar que ya no queda nada dañado.');

  // El codigo de salida dice la verdad: si algo fallo, no sale 0.
  process.exitCode = conError > 0 ? 1 : 0;
})().catch((e) => {
  console.error('');
  console.error('ABORTADO: ' + e.message);
  console.error('');
  console.error('Si el fallo ocurrio DESPUES de empezar a escribir, lo ya aplicado');
  console.error('esta en scripts/volcados/reparacion-vinculos-*.json: el registro se');
  console.error('guarda tras cada ficha, no al final.');
  process.exit(1);
});
