/**
 * Radiografía de una colección de Firestore. SOLO LEE.
 *
 *   node scripts/inspeccionar-coleccion.cjs richieste
 *   node scripts/inspeccionar-coleccion.cjs richieste --volcar
 *
 * Con `--volcar` escribe además un JSON con el contenido íntegro en
 * scripts/volcados/<coleccion>-<n>.json. Nunca modifica la base.
 *
 * PARA QUÉ SE ESCRIBIÓ
 * Para decidir si una ruta de la API es código muerto de verdad. Una ruta sin
 * consumidores en el repositorio NO es lo mismo que una ruta prescindible: si
 * es la única vía de lectura sobre una colección que alguien sigue alimentando
 * desde fuera, borrarla deja esos datos sin ninguna forma de consultarlos.
 * Antes de borrar hay que mirar TRES cosas, no dos: cuántos documentos hay, la
 * fecha del más reciente y la del MÁS ANTIGUO. La tercera es la que distingue
 * un flujo vivo de un residuo heredado.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const coleccion = process.argv[2];
const volcar = process.argv.includes('--volcar');

if (!coleccion) {
  console.error('Uso: node scripts/inspeccionar-coleccion.cjs <coleccion> [--volcar]');
  process.exit(1);
}

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

/** Las fechas del CRM viven en tres formas distintas según la época. */
function fechaDe(d) {
  for (const clave of ['createdAt', 'dataCreazione', 'DataCreazione', 'data', 'timestamp']) {
    const v = d[clave];
    if (!v) continue;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      const p = new Date(v);
      if (!isNaN(p.getTime())) return p;
    }
  }
  return null;
}

(async () => {
  const ref = db.collection(coleccion);
  const total = (await ref.count().get()).data().count;

  console.log('Coleccion: ' + coleccion);
  console.log('  documentos ............ ' + total);

  if (total === 0) {
    console.log('');
    console.log('VACIA. Nada que preservar.');
    process.exit(0);
  }

  const snap = await ref.limit(Math.min(total, 1000)).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const fechas = docs.map(fechaDe).filter(Boolean).sort((a, b) => a - b);
  console.log('  con fecha reconocible . ' + fechas.length + ' de ' + docs.length);
  if (fechas.length) {
    console.log('  mas antiguo ........... ' + fechas[0].toISOString());
    console.log('  mas reciente .......... ' + fechas[fechas.length - 1].toISOString());
  }

  const claves = new Set();
  for (const d of docs) for (const k of Object.keys(d)) claves.add(k);
  console.log('  campos presentes ...... ' + [...claves].sort().join(', '));

  console.log('');
  console.log('PRIMEROS DOCUMENTOS (recortados):');
  for (const d of docs.slice(0, 5)) {
    const breve = JSON.stringify(d, (k, v) =>
      typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v,
    );
    console.log('  ' + breve.slice(0, 300));
  }

  if (volcar) {
    const dir = path.join(__dirname, 'volcados');
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, coleccion + '-' + docs.length + '.json');
    fs.writeFileSync(destino, JSON.stringify(docs, null, 2));
    console.log('');
    console.log('Volcado escrito en ' + destino);
  }

  process.exit(0);
})().catch((e) => {
  console.error('ERROR: ' + (e.stack || e.message));
  process.exit(1);
});
