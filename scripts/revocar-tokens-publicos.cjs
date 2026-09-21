/**
 * Revoca el acceso público de los documentos PRIVADOS del bucket.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ PROBLEMA CIERRA
 *
 * `/api/upload` estampaba un `firebaseStorageDownloadTokens` en cada fichero
 * que subía. Ese token es el mecanismo de «cualquiera con el enlace» de
 * Firebase: NO pasa por `storage.rules`, no caduca, y no lo corta ni bloquear
 * al usuario, ni degradarlo, ni cerrar su sesión, ni rotar `SESSION_SECRET`.
 *
 * Comprobado con un `curl` sin ninguna credencial: un folio de visita firmado
 * responde HTTP 200, `application/pdf`, 35.971 bytes.
 *
 * El código se arregló el 19 de septiembre (`08e369e`): desde entonces solo las
 * fotos de inmuebles reciben token, y los documentos se sirven por el proxy
 * autenticado. Lo que queda expuesto es lo subido ANTES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ HACE Y QUÉ NO HACE
 *
 *   SÍ  quita el metadato `firebaseStorageDownloadTokens` de los objetos
 *       privados del bucket. Eso y solo eso.
 *
 *   NO  borra ni un fichero.
 *   NO  escribe ni un campo en Firestore. Las URLs guardadas se quedan como
 *       están: son un dato de negocio. La interfaz ya no depende de ellas
 *       porque `urlDeDescarga` traduce al pintar (ver storage-urls.ts).
 *   NO  toca las fotos de inmuebles. Idealista las descarga sin sesión y
 *       revocarlas despublicaría el escaparate de la agencia.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTO NO SE DESHACE
 *
 * Un token revocado no se puede restaurar: Firebase puede emitir uno NUEVO,
 * pero sería otro, con otra URL. **Cualquier enlace que ya se haya compartido
 * por fuera —con un cliente, con un notario, por WhatsApp— dejará de
 * funcionar para siempre.** Dentro del CRM no se nota nada.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * USO
 *
 *   node scripts/revocar-tokens-publicos.cjs               <- solo cuenta
 *   node scripts/revocar-tokens-publicos.cjs --ejecutar    <- revoca de verdad
 *
 * Es IDEMPOTENTE: un objeto sin token se salta. Relanzarlo no hace nada.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const EJECUTAR = process.argv.includes('--ejecutar');
const RAIZ = path.join(__dirname, '..');

// ════════════════════════════════════════════════════════════════════════════
// Dos comprobaciones previas. Si cualquiera falla, el script no se ejecuta.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Las mismas rutas públicas que declara `src/lib/storage-urls.ts`.
 *
 * Están copiadas aquí porque este script es CommonJS y no puede importar
 * TypeScript. Para que la copia no se quede atrás en silencio —que es
 * exactamente cómo se revocaría por error una foto que Idealista necesita— el
 * script LEE ese fichero y aborta si las dos listas no coinciden.
 */
const FORMAS_PUBLICAS = [
  /^immobili\/[^/]+\/foto\//,
  /^propiedades_fotos\//,
  /^inmuebles\//,
  /^propiedades\//,
];

function comprobarQueLasRutasPublicasCoinciden() {
  const ruta = path.join(RAIZ, 'src/lib/storage-urls.ts');
  const fuente = fs.readFileSync(ruta, 'utf8');
  const bloque = fuente.match(/const FORMAS_PUBLICAS: RegExp\[\] = \[([\s\S]*?)\];/);
  if (!bloque) {
    throw new Error('No encuentro FORMAS_PUBLICAS en storage-urls.ts. No sigo a ciegas.');
  }
  // Línea a línea y sin intentar reconocer la sintaxis de una expresión
  // regular con otra expresión regular: eso es justo lo que fallaba antes,
  // truncando `/^immobili\/[^/]+\/foto\//` a `/^immobili\/` y disparando una
  // falsa alarma. Cada patrón está en su propia línea, así que basta con eso.
  const enLaApp = bloque[1]
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    .filter((l) => l.startsWith('/'))
    .join(' | ');
  const enElScript = FORMAS_PUBLICAS.map((r) => r.toString()).join(' | ');

  if (enLaApp.replace(/\s/g, '') !== enElScript.replace(/\s/g, '')) {
    throw new Error(
      'Las rutas publicas de storage-urls.ts y las de este script NO coinciden.\n' +
      '  en la app:    ' + enLaApp + '\n' +
      '  en el script: ' + enElScript + '\n' +
      'Abortado: seguir podria revocar una foto que Idealista necesita.',
    );
  }
}

function comprobarQueLaAppYaSirvePorElProxy() {
  const fuente = fs.readFileSync(path.join(RAIZ, 'src/lib/storage-urls.ts'), 'utf8');
  if (!fuente.includes('export function urlDeDescarga')) {
    throw new Error(
      'La app todavia no traduce las URLs guardadas al proxy autenticado.\n' +
      'Revocar ahora dejaria al CRM sin poder abrir sus propios documentos.\n' +
      'Hace falta el commit que anade urlDeDescarga a storage-urls.ts.',
    );
  }
  // Y que la interfaz la use de verdad, no solo que exista.
  const pantallas = [
    'src/app/documenti/page.tsx',
    'src/app/proprietari/page.tsx',
    'src/app/clienti/page.tsx',
  ];
  const sinUsar = pantallas.filter(
    (p) => !fs.readFileSync(path.join(RAIZ, p), 'utf8').includes('urlDeDescarga'),
  );
  if (sinUsar.length) {
    throw new Error(
      'Estas pantallas todavia enlazan la URL publica en crudo:\n  ' +
      sinUsar.join('\n  ') + '\nRevocar ahora les romperia las descargas.',
    );
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

const esPublica = (ruta) => FORMAS_PUBLICAS.some((re) => re.test(ruta));

/** Cómo se agrupa cada ruta en el informe. */
function grupoDe(ruta) {
  if (ruta.startsWith('documenti_generati/')) return 'documenti_generati (folios firmados y contratos)';
  if (/^immobili\/[^/]+\/documenti\//.test(ruta)) return 'immobili/*/documenti (contratos, identidades, planimetrias)';
  if (ruta.startsWith('proprietari_docs/')) return 'proprietari_docs';
  if (ruta.startsWith('clienti/')) return 'clienti';
  if (ruta.startsWith('documenti/')) return 'documenti (modelos)';
  // El cajon de sastre se abre POR PREFIJO RAIZ, no se agrupa en una linea.
  // Un solo renglon que dijera «otras rutas privadas» es justo donde se
  // esconderia una carpeta de fotos mal clasificada, y revocarla
  // despublicaria el escaparate.
  const raizDeLaRuta = ruta.split('/')[0];
  return 'SIN CLASIFICAR: ' + raizDeLaRuta + '/';
}

(async () => {
  comprobarQueLasRutasPublicasCoinciden();
  comprobarQueLaAppYaSirvePorElProxy();
  cargarEnv();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en .env.local');
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  // El bucket se RESUELVE y se dice cuál se usó, en vez de darlo por hecho.
  // `FIREBASE_STORAGE_BUCKET` puede traer el nombre antiguo `.appspot.com`
  // mientras las URLs guardadas apuntan al nuevo `.firebasestorage.app`, y
  // revocar en el bucket equivocado no haría nada y daría una falsa sensación
  // de cierre.
  const bucketsPosibles = [
    bucketName,
    `${projectId}.firebasestorage.app`,
    `${projectId}.appspot.com`,
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  let bucket = null;
  let usado = null;
  for (const nombre of bucketsPosibles) {
    const b = admin.storage().bucket(nombre);
    try {
      const [existe] = await b.exists();
      if (existe) { bucket = b; usado = nombre; break; }
    } catch { /* se prueba el siguiente */ }
  }
  if (!bucket) {
    throw new Error('Ninguno de estos buckets existe o es accesible:\n  ' + bucketsPosibles.join('\n  '));
  }

  console.log('Proyecto: ' + projectId);
  console.log('Bucket:   ' + usado + (usado === bucketName ? '' : '   (el de FIREBASE_STORAGE_BUCKET no existe; se usa este)'));
  console.log('Modo:     ' + (EJECUTAR ? '*** REVOCANDO DE VERDAD (--ejecutar) ***' : 'SOLO RECUENTO (dry-run)'));
  console.log('');
  console.log('Recorriendo el bucket…');

  const [ficheros] = await bucket.getFiles();

  const porGrupo = new Map();
  const ejemplos = new Map();
  const tiposPorGrupo = new Map();
  let publicasIntactas = 0;
  let sinToken = 0;
  let candidatos = 0;
  const aRevocar = [];

  // CENSO COMPLETO, no solo de lo que se va a tocar.
  //
  // La primera version solo detallaba los candidatos, y por eso 443 fotos de
  // inmuebles —todo `propiedades_fotos/`, que no figuraba en ninguna lista del
  // proyecto— se colaron entre los «documentos privados». Un informe que solo
  // ensena lo que vas a romper no te ensena que estas a punto de romperlo.
  // Ahora cada objeto del bucket sale en el censo, con su veredicto.
  const censo = new Map();

  for (const f of ficheros) {
    const ruta = f.name;
    if (ruta.endsWith('/')) continue; // "carpetas"

    const token = f.metadata?.metadata?.firebaseStorageDownloadTokens;

    const raiz = ruta.includes('/') ? ruta.split('/')[0] + '/' : '(raiz del bucket)';
    const fila = censo.get(raiz) || { total: 0, publicos: 0, privados: 0, conToken: 0, tipos: new Set() };
    fila.total++;
    if (esPublica(ruta)) fila.publicos++; else fila.privados++;
    if (token) fila.conToken++;
    fila.tipos.add((f.metadata && f.metadata.contentType) || '?');
    censo.set(raiz, fila);

    if (esPublica(ruta)) {
      if (token) publicasIntactas++;
      continue;
    }
    if (!token) { sinToken++; continue; }

    candidatos++;
    const g = grupoDe(ruta);
    porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
    if (!ejemplos.has(g)) ejemplos.set(g, ruta);
    if (!tiposPorGrupo.has(g)) tiposPorGrupo.set(g, new Set());
    tiposPorGrupo.get(g).add((f.metadata && f.metadata.contentType) || '?');
    aRevocar.push(f);
  }

  console.log('');
  console.log('OBJETOS EN EL BUCKET: ' + ficheros.length);
  console.log('');
  console.log('CENSO POR PREFIJO — todo el bucket, no solo lo que se tocaria:');
  console.log('');
  console.log('  ' + 'prefijo'.padEnd(24) + 'total'.padStart(7) + 'publicos'.padStart(10) +
    'privados'.padStart(10) + '  tipos');
  for (const [raiz, v] of [...censo].sort((a, b) => b[1].total - a[1].total)) {
    console.log('  ' + raiz.slice(0, 23).padEnd(24) + String(v.total).padStart(7) +
      String(v.publicos).padStart(10) + String(v.privados).padStart(10) +
      '  ' + [...v.tipos].join(', ').slice(0, 44));
  }
  console.log('');
  console.log('  Revisa esta tabla ANTES de ejecutar: si un prefijo de FOTOS');
  console.log('  aparece con «privados» distinto de cero, PARA. Son fotos que');
  console.log('  se despublicarian, y eso deja en blanco el escaparate.');
  console.log('');
  console.log('  fotos publicas con token, SE QUEDAN COMO ESTAN .... ' + publicasIntactas);
  console.log('  privados que ya no tienen token (nada que hacer) .. ' + sinToken);
  console.log('  privados CON token publico, a revocar ............. ' + candidatos);
  console.log('');

  if (candidatos === 0) {
    console.log('Nada que revocar. El bucket ya esta cerrado.');
    process.exit(0);
  }

  console.log('  reparto de lo que se revocaria:');
  for (const [g, n] of [...porGrupo].sort((a, b) => b[1] - a[1])) {
    console.log('    ' + String(n).padStart(5) + '  ' + g);
    console.log('           tipos: ' + [...(tiposPorGrupo.get(g) || [])].join(', '));
    console.log('           p.ej. ' + ejemplos.get(g));
  }

  if (!EJECUTAR) {
    console.log('');
    console.log('──────────────────────────────────────────────────────────────');
    console.log('DRY-RUN: no se ha tocado NADA.');
    console.log('');
    console.log('Para revocar de verdad:');
    console.log('    node scripts/revocar-tokens-publicos.cjs --ejecutar');
    console.log('');
    console.log('RECUERDA: un token revocado no se restaura. Cualquier enlace');
    console.log('que se haya compartido por fuera dejara de funcionar para');
    console.log('siempre. Dentro del CRM no se nota nada.');
    console.log('──────────────────────────────────────────────────────────────');
    process.exit(0);
  }

  // ── Ejecución real ────────────────────────────────────────────────────────
  console.log('');
  console.log('Revocando…');

  const registro = [];
  let hechos = 0;
  let fallos = 0;

  for (const f of aRevocar) {
    try {
      // `null` borra la clave del metadato. El fichero NO se toca.
      await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
      registro.push({ ruta: f.name, ok: true });
      hechos++;
      if (hechos % 50 === 0) console.log('  ' + hechos + ' de ' + aRevocar.length + '…');
    } catch (e) {
      registro.push({ ruta: f.name, ok: false, error: e.message });
      fallos++;
      console.error('  FALLO en ' + f.name + ': ' + e.message);
    }
  }

  const dir = path.join(__dirname, 'volcados');
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, 'revocacion-' + Date.now() + '.json');
  fs.writeFileSync(destino, JSON.stringify(registro, null, 2));

  console.log('');
  console.log('  revocados .... ' + hechos);
  console.log('  fallidos ..... ' + fallos);
  console.log('  registro en .. ' + destino);
  console.log('');
  console.log('Relanza el script sin --ejecutar para comprobar que queda en cero.');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  console.error('');
  console.error('ABORTADO: ' + (e.message || e));
  process.exit(1);
});
