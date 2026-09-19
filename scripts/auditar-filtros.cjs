/**
 * Auditoría de los 12 filtros avanzados contra los datos REALES.
 *
 * No supone nada sobre la forma de los campos: los mide. Para cada filtro
 * comprueba la clase de fallo que le corresponde:
 *
 *   igualdad estricta  ->  ¿el desplegable ofrece todos los valores que hay?
 *   coacción numérica  ->  ¿cuántos documentos dan NaN al pasar por Number()?
 *   booleano truthy    ->  ¿qué claves y qué tipos hay de verdad en el mapa?
 *
 * Solo lee. No escribe nada.
 *
 *   node scripts/auditar-filtros.cjs
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function cargarEnv() {
  const ruta = path.join(__dirname, '..', '.env.local');
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
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

const leer = (d, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);

/** Campos comparados con igualdad estricta contra un desplegable. */
const CERRADOS = ['DatiBase.Tipologia', 'DettagliFisici.ClasseEnergetica'];

/** Campos que el filtro pasa por Number(). Aquí es donde se esconde el NaN. */
const NUMERICOS = [
  'GestioneCommerciale.PrezzoVendita',
  'GestioneCommerciale.PrezzoAffitto',
  'DettagliFisici.CamereLetto',
  'DettagliFisici.Bagni',
  'DettagliFisici.MetriCommerciali',
];

/** Campos comparados por subcadena normalizada. */
const TEXTO = ['DatiBase.Zona', 'DatiBase.Citta'];

(async () => {
  const snap = await db
    .collection('immobili')
    .select(
      ...CERRADOS, ...NUMERICOS, ...TEXTO,
      'Caratteristiche',
      'GestioneCommerciale.Sospeso',
    )
    .get();

  const docs = snap.docs.map((d) => d.data());
  console.log('documentos analizados: ' + docs.length);

  // ── 1. Vocabularios cerrados ──────────────────────────────────────────────
  for (const ruta of CERRADOS) {
    const cuenta = new Map();
    for (const d of docs) {
      const v = leer(d, ruta);
      const k = v === undefined ? '(ausente)' : JSON.stringify(v);
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    console.log('');
    console.log('== ' + ruta + ' ==  (igualdad estricta)  valores: ' + cuenta.size);
    for (const [v, n] of [...cuenta].sort((a, b) => b[1] - a[1])) {
      console.log('   ' + String(n).padStart(4) + '  ' + v);
    }
  }

  // ── 2. Campos numéricos: ¿cuántos se pierden al coaccionar? ───────────────
  for (const ruta of NUMERICOS) {
    let ausentes = 0, numeros = 0, cadenasOk = 0;
    const cadenasRotas = new Map();
    for (const d of docs) {
      const v = leer(d, ruta);
      if (v === undefined || v === null || v === '') { ausentes++; continue; }
      if (typeof v === 'number') { numeros++; continue; }
      // Exactamente lo que hace el filtro: Number(v).
      if (Number.isFinite(Number(v))) cadenasOk++;
      else cadenasRotas.set(JSON.stringify(v), (cadenasRotas.get(JSON.stringify(v)) || 0) + 1);
    }
    const rotos = [...cadenasRotas.values()].reduce((s, n) => s + n, 0);
    console.log('');
    console.log('== ' + ruta + ' ==  (pasa por Number())');
    console.log('   numeros de verdad ....... ' + numeros);
    console.log('   cadenas que Number() lee  ' + cadenasOk);
    console.log('   ausentes o vacios ....... ' + ausentes);
    console.log('   CADENAS QUE DAN NaN ..... ' + rotos + (rotos ? '   <-- INVISIBLES AL FILTRO' : ''));
    for (const [v, n] of [...cadenasRotas].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log('      ' + String(n).padStart(4) + '  ' + v);
    }
  }

  // ── 3. Campos de texto por subcadena ──────────────────────────────────────
  for (const ruta of TEXTO) {
    const cuenta = new Map();
    for (const d of docs) {
      const v = leer(d, ruta);
      const k = v === undefined || v === '' ? '(vacio)' : JSON.stringify(v);
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    const orden = [...cuenta].sort((a, b) => b[1] - a[1]);
    console.log('');
    console.log('== ' + ruta + ' ==  (subcadena)  valores: ' + orden.size || orden.length);
    for (const [v, n] of orden.slice(0, 20)) console.log('   ' + String(n).padStart(4) + '  ' + v);
    if (orden.length > 20) console.log('   ... y ' + (orden.length - 20) + ' mas');
  }

  // ── 4. Caratteristiche: las nueve casillas ────────────────────────────────
  const ESPERADAS = [
    'Ascensore', 'Balcone', 'Terrazza', 'Garage', 'Giardino',
    'Arredato', 'VistaMare', 'AriaCondizionata', 'RiscaldamentoAutonomo',
  ];
  const clavesVistas = new Map();
  const tiposPorClave = new Map();
  let sinMapa = 0;
  for (const d of docs) {
    const c = d.Caratteristiche;
    if (!c || typeof c !== 'object') { sinMapa++; continue; }
    for (const [k, v] of Object.entries(c)) {
      clavesVistas.set(k, (clavesVistas.get(k) || 0) + 1);
      if (!tiposPorClave.has(k)) tiposPorClave.set(k, new Map());
      const t = tiposPorClave.get(k);
      const etiqueta = typeof v + (typeof v === 'string' ? '=' + JSON.stringify(v) : '');
      t.set(etiqueta, (t.get(etiqueta) || 0) + 1);
    }
  }

  console.log('');
  console.log('== Caratteristiche ==  (booleano truthy)');
  console.log('   documentos sin el mapa ... ' + sinMapa);
  console.log('   claves distintas ......... ' + clavesVistas.size);
  console.log('');
  console.log('   LAS NUEVE QUE FILTRA LA INTERFAZ:');
  for (const k of ESPERADAS) {
    const n = clavesVistas.get(k) || 0;
    const tipos = tiposPorClave.get(k);
    const verdaderos = docs.filter((d) => d.Caratteristiche?.[k]).length;
    console.log(
      '     ' + k.padEnd(24) + ' presente en ' + String(n).padStart(4) +
      '   truthy en ' + String(verdaderos).padStart(4) +
      (n === 0 ? '   <-- LA CLAVE NO EXISTE EN LA BASE' : '') +
      (tipos ? '   tipos: ' + [...tipos].map(([t, c]) => t + 'x' + c).join(' ') : ''),
    );
  }
  const sobrantes = [...clavesVistas.keys()].filter((k) => !ESPERADAS.includes(k));
  if (sobrantes.length) {
    console.log('');
    console.log('   CLAVES QUE HAY EN LA BASE Y LA INTERFAZ NO OFRECE:');
    for (const k of sobrantes.sort((a, b) => clavesVistas.get(b) - clavesVistas.get(a))) {
      const tipos = tiposPorClave.get(k);
      const verdaderos = docs.filter((d) => d.Caratteristiche?.[k] === true).length;
      console.log('     ' + k.padEnd(24) + ' presente en ' + String(clavesVistas.get(k)).padStart(4) +
        '   truthy en ' + String(verdaderos).padStart(4) +
        '   tipos: ' + [...tipos].map(([t, c]) => t + 'x' + c).join(' '));
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
