/**
 * Comprobacion previa al cambio de /api/immobili: empujar el filtro
 * status=attivi a Firestore, ¿esconde algun inmueble que hoy se ve?
 *
 * No se fia del recuento en JS del backfill. Usa DOS vias independientes:
 *
 *   A) Agregaciones count() — leen el INDICE, no los documentos. Un documento
 *      sin el campo no esta en el indice, asi que si true+false == total,
 *      entonces todos los documentos tienen el campo. Es la medicion que
 *      importa, porque es exactamente lo que vera la consulta nueva.
 *
 *   B) Comparacion de conjuntos de ids: lo que devuelve la consulta de HOY
 *      (escanear + filtrar en JS) contra lo que devolveria la consulta NUEVA
 *      (where Sospeso == false). Si sobra o falta un solo id, no se cambia.
 *
 * Solo lee. No escribe nada.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function cargarEnv() {
  const ruta = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = valor;
  }
}
cargarEnv();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();
const col = () => db.collection('immobili');
const cuenta = async (q) => (await q.count().get()).data().count;

(async () => {
  // ── A) Agregaciones ───────────────────────────────────────────────────────
  const total = await cuenta(col());
  const conFalse = await cuenta(col().where('GestioneCommerciale.Sospeso', '==', false));
  const conTrue = await cuenta(col().where('GestioneCommerciale.Sospeso', '==', true));

  console.log('A) AGREGACIONES count() — sobre el indice');
  console.log('   total en immobili ............ ' + total);
  console.log('   Sospeso == false ............. ' + conFalse);
  console.log('   Sospeso == true .............. ' + conTrue);
  console.log('   suma ......................... ' + (conFalse + conTrue) +
    (conFalse + conTrue === total ? '   OK: todos indexados' : '   <-- ' + (total - conFalse - conTrue) + ' FUERA DEL INDICE'));

  // Trampa aparte: la consulta del listado ordena por DatiBase.Codice. Un
  // documento sin ese campo queda fuera del orderBy y ya hoy es invisible.
  const conCodice = await cuenta(col().orderBy('DatiBase.Codice', 'desc'));
  console.log('   con DatiBase.Codice .......... ' + conCodice +
    (conCodice === total ? '   OK' : '   <-- ' + (total - conCodice) + ' SIN CODICE, invisibles ya hoy'));

  // ── B) Conjuntos de ids reales ────────────────────────────────────────────
  const ids = async (q) => {
    const s = new Set();
    let ultimo = null;
    for (;;) {
      let qq = q.select('_status', 'GestioneCommerciale.Sospeso', 'DatiBase.Codice').limit(500);
      if (ultimo) qq = qq.startAfter(ultimo);
      const snap = await qq.get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        if (d.data()?._status === 'pendente_cancellazione') continue;
        s.add(d.id);
      }
      ultimo = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }
    return s;
  };

  // HOY: escanea todo ordenado y descarta los suspendidos en JS.
  const hoy = new Set();
  {
    let ultimo = null;
    for (;;) {
      let q = col().orderBy('DatiBase.Codice', 'desc').select('_status', 'GestioneCommerciale.Sospeso', 'DatiBase.Codice').limit(500);
      if (ultimo) q = q.startAfter(ultimo);
      const snap = await q.get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        const x = d.data();
        if (x?._status === 'pendente_cancellazione') continue;
        if (x?.GestioneCommerciale?.Sospeso) continue; // ausente o false = activo
        hoy.add(d.id);
      }
      ultimo = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }
  }

  // NUEVO: el filtro va a Firestore.
  const nuevo = await ids(col().where('GestioneCommerciale.Sospeso', '==', false).orderBy('DatiBase.Codice', 'desc'));

  const perdidos = [...hoy].filter((id) => !nuevo.has(id));
  const ganados = [...nuevo].filter((id) => !hoy.has(id));

  console.log('');
  console.log('B) CONJUNTOS DE IDS — status=attivi');
  console.log('   visibles hoy (escaneo + JS) .. ' + hoy.size);
  console.log('   visibles con el filtro en DB . ' + nuevo.size);
  console.log('   DESAPARECERIAN ............... ' + perdidos.length);
  console.log('   aparecerian de mas ........... ' + ganados.length);
  if (perdidos.length) console.log('   ids perdidos: ' + perdidos.slice(0, 20).join(', '));
  if (ganados.length) console.log('   ids ganados: ' + ganados.slice(0, 20).join(', '));

  // ── C) ¿Hay índice para cada forma real de la consulta? ───────────────────
  // Un compuesto ausente no da error al desplegar: da FAILED_PRECONDITION la
  // primera vez que un agente abre el listado. Se lanzan las cuatro de verdad.
  console.log('');
  console.log('C) INDICES — se lanza cada consulta real con limit(1)');
  const formas = [
    ['attivi', col().where('GestioneCommerciale.Sospeso', '==', false)],
    ['attivi + vendita', col().where('GestioneCommerciale.Sospeso', '==', false).where('GestioneCommerciale.InVendita', '==', true)],
    ['attivi + affitto', col().where('GestioneCommerciale.Sospeso', '==', false).where('GestioneCommerciale.InAffitto', '==', true)],
    ['sospesi', col().where('GestioneCommerciale.Sospeso', '==', true)],
    ['sospesi + vendita', col().where('GestioneCommerciale.Sospeso', '==', true).where('GestioneCommerciale.InVendita', '==', true)],
    ['sospesi + affitto', col().where('GestioneCommerciale.Sospeso', '==', true).where('GestioneCommerciale.InAffitto', '==', true)],
  ];
  let faltaIndice = false;
  for (const [nombre, q] of formas) {
    try {
      const s = await q.orderBy('DatiBase.Codice', 'desc').limit(1).get();
      console.log('   ' + nombre.padEnd(20) + ' OK (' + s.size + ')');
    } catch (e) {
      faltaIndice = true;
      console.log('   ' + nombre.padEnd(20) + ' FALLA: ' + (e.code === 9 ? 'FALTA INDICE' : e.message));
    }
  }

  console.log('');
  const seguro = perdidos.length === 0 && ganados.length === 0 && conFalse + conTrue === total && !faltaIndice;
  console.log(seguro ? 'SEGURO empujar el filtro a Firestore.' : 'NO empujar el filtro todavia.');
  process.exit(seguro ? 0 : 1);
})().catch((e) => {
  console.error('ERROR: ' + (e.stack || e.message));
  process.exit(1);
});
