/**
 * Migracion 2 de 2 — backfill de GestioneCommerciale.Sospeso
 * ===========================================================
 *
 * POR QUE EXISTE
 * El listado por defecto del CRM (status=attivi) no puede empujar el filtro a
 * Firestore, porque where('GestioneCommerciale.Sospeso','==',false) EXCLUYE los
 * documentos que no tienen el campo — y los inmuebles migrados no lo tienen.
 * Filtrarlo en Firestore hoy haria desaparecer inmuebles activos de la pantalla
 * principal. Por eso se filtra en JS y la vista escanea la coleccion entera.
 * Este script rellena el campo que falta para poder cerrar ese agujero.
 *
 * QUE HACE, EXACTAMENTE
 *   Escribe GestioneCommerciale.Sospeso = false, POR RUTA DE CAMPO, y SOLO en
 *   los documentos donde ese campo no existe.
 *
 * QUE NO HACE — las cuatro garantias:
 *   1. No reemplaza el mapa GestioneCommerciale. Usa FieldPath, de modo que
 *      Firestore toca una sola hoja y deja intactos PrezzoVendita, InVendita,
 *      Provvigioni y todo lo demas.
 *   2. No toca ningun documento que ya tenga el campo, valga true o false.
 *   3. No borra nada, no renombra nada, no escribe en ninguna otra coleccion.
 *   4. Cada escritura lleva una precondicion lastUpdateTime: si alguien modifico
 *      el documento entre la lectura y la escritura, la escritura se RECHAZA en
 *      lugar de pisar el cambio ajeno.
 *
 * VALORES RAROS
 * Un Sospeso que exista pero no sea booleano (null, "false", 0...) NO se toca:
 * escribirle false seria alterar un dato existente. Se cuenta aparte y se
 * enumera al final para decidir a mano.
 *
 * IDEMPOTENTE: relanzarlo vuelve a contar y no encuentra nada que escribir.
 *
 * USO
 *   node scripts/backfill-sospeso.cjs            <- solo cuenta, no escribe nada
 *   node scripts/backfill-sospeso.cjs --apply    <- escribe, en lotes de 400
 *
 * RESULTADO EN PRODUCCION (2026-09-20, crm-pantaleo-propio)
 *   870 documentos, 870 con el campo, 0 sin el campo, 0 con valores raros.
 *   Es decir: NO HIZO FALTA ESCRIBIR NADA. La premisa de la que partia el plan
 *   —"al campo Sospeso le faltan los documentos migrados"— ya no se cumplia.
 *   El script se conserva igualmente: es idempotente, y si algun dia una
 *   importacion vuelve a meter documentos sin el campo, el listado volveria a
 *   esconderlos y esto lo detecta y lo arregla.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APLICAR = process.argv.includes('--apply');
const TAMANO_LOTE = 400;
const TAMANO_PAGINA = 500;

// ── Credenciales: mismo origen que la app (.env.local), mismo tratamiento ────
// next carga .env.local solo; un `node` pelado no, asi que se parsea a mano.
function cargarEnv() {
  const ruta = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    // Las claves privadas vienen entrecomilladas y con \n escapados.
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = valor;
  }
}
cargarEnv();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

if (!projectId || !clientEmail || !privateKey) {
  console.error('FALTAN CREDENCIALES. Se esperan FIREBASE_PROJECT_ID,');
  console.error('FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en .env.local');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
const db = admin.firestore();
const { FieldPath } = admin.firestore;
const RUTA_SOSPESO = new FieldPath('GestioneCommerciale', 'Sospeso');

/**
 * Recorre `immobili` entera, paginando por id, y clasifica cada documento.
 * Se proyectan DOS campos y nada mas: la lectura cuesta lo mismo, pero el
 * documento completo lleva los cuatro arrays de fotos legacy y no hacen falta.
 */
async function escanear() {
  const faltan = [];
  const anomalos = [];
  let yaLoTienen = 0;
  let total = 0;
  let ultimo = null;

  for (;;) {
    let q = db.collection('immobili')
      .orderBy(FieldPath.documentId())
      .select('GestioneCommerciale.Sospeso', '_status')
      .limit(TAMANO_PAGINA);
    if (ultimo) q = q.startAfter(ultimo);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      total++;
      const valor = doc.data()?.GestioneCommerciale?.Sospeso;
      if (valor === undefined) {
        faltan.push({ ref: doc.ref, id: doc.id, updateTime: doc.updateTime, estado: doc.data()?._status });
      } else if (typeof valor === 'boolean') {
        yaLoTienen++;
      } else {
        anomalos.push({ id: doc.id, valor: JSON.stringify(valor) });
      }
    }

    ultimo = snap.docs[snap.docs.length - 1];
    if (snap.size < TAMANO_PAGINA) break;
  }

  return { total, faltan, yaLoTienen, anomalos };
}

/**
 * Escribe en lotes. Cada update lleva precondicion de lastUpdateTime; si el
 * documento cambio desde la lectura, el lote entero falla — y entonces se
 * reintenta documento a documento para no perder los 399 inocentes.
 */
async function escribir(faltan) {
  let escritos = 0;
  const rechazados = [];

  for (let i = 0; i < faltan.length; i += TAMANO_LOTE) {
    const trozo = faltan.slice(i, i + TAMANO_LOTE);
    const lote = db.batch();
    for (const d of trozo) {
      lote.update(d.ref, RUTA_SOSPESO, false, { lastUpdateTime: d.updateTime });
    }

    try {
      await lote.commit();
      escritos += trozo.length;
      console.log('  lote ' + (Math.floor(i / TAMANO_LOTE) + 1) + ': ' + trozo.length + ' documentos');
    } catch (e) {
      console.log('  lote ' + (Math.floor(i / TAMANO_LOTE) + 1) + ' rechazado (' + e.code + '), reintentando de uno en uno');
      for (const d of trozo) {
        try {
          await d.ref.update(RUTA_SOSPESO, false, { lastUpdateTime: d.updateTime });
          escritos++;
        } catch (e2) {
          rechazados.push({ id: d.id, motivo: e2.code || e2.message });
        }
      }
    }
  }

  return { escritos, rechazados };
}

(async () => {
  console.log('Proyecto: ' + projectId);
  console.log('Modo: ' + (APLICAR ? 'ESCRITURA (--apply)' : 'SOLO RECUENTO (dry-run)'));
  console.log('');

  const antes = await escanear();
  console.log('RECUENTO INICIAL');
  console.log('  documentos en immobili ........ ' + antes.total);
  console.log('  ya tienen Sospeso ............. ' + antes.yaLoTienen);
  console.log('  NO tienen Sospeso ............. ' + antes.faltan.length);
  console.log('  con valor no booleano ......... ' + antes.anomalos.length + (antes.anomalos.length ? '  (no se tocan)' : ''));

  if (antes.anomalos.length) {
    console.log('');
    console.log('  valores raros, para revisar a mano:');
    for (const a of antes.anomalos.slice(0, 20)) console.log('    ' + a.id + ' -> ' + a.valor);
  }

  if (antes.faltan.length) {
    const porEstado = {};
    for (const d of antes.faltan) porEstado[d.estado || 'activo'] = (porEstado[d.estado || 'activo'] || 0) + 1;
    console.log('');
    console.log('  desglose de los que faltan: ' + JSON.stringify(porEstado));
  }

  if (!APLICAR) {
    console.log('');
    console.log('Dry-run: no se ha escrito nada. Relanza con --apply para aplicarlo.');
    process.exit(0);
  }

  if (!antes.faltan.length) {
    console.log('');
    console.log('Nada que hacer: la base ya esta migrada.');
    process.exit(0);
  }

  console.log('');
  console.log('ESCRIBIENDO Sospeso=false en ' + antes.faltan.length + ' documentos (lotes de ' + TAMANO_LOTE + ')');
  const { escritos, rechazados } = await escribir(antes.faltan);

  console.log('');
  console.log('  escritos ...................... ' + escritos);
  console.log('  rechazados .................... ' + rechazados.length);
  for (const r of rechazados) console.log('    ' + r.id + ' -> ' + r.motivo);

  // Recuento final: se vuelve a escanear de verdad, no se resta sobre el papel.
  console.log('');
  const despues = await escanear();
  console.log('RECUENTO FINAL');
  console.log('  documentos en immobili ........ ' + despues.total + (despues.total === antes.total ? '  (igual que antes)' : '  <-- OJO, HA CAMBIADO'));
  console.log('  ya tienen Sospeso ............. ' + despues.yaLoTienen);
  console.log('  NO tienen Sospeso ............. ' + despues.faltan.length);
  console.log('');
  console.log(despues.faltan.length === 0 ? 'MIGRACION COMPLETA.' : 'QUEDAN ' + despues.faltan.length + ' SIN MIGRAR.');
  process.exit(despues.faltan.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR: ' + (e.stack || e.message));
  process.exit(1);
});
