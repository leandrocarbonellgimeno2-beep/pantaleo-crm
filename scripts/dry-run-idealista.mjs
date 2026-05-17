/**
 * DRY RUN LOCAL — Firestore real + Mapper real, ZERO chiamate a Idealista
 * Uso: node scripts/dry-run-idealista.mjs 1000050
 */

import { readFileSync } from 'fs';
import { resolve }      from 'path';

// ── Carica .env.local manualmente ────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) {
    process.env[key.trim()] = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
  }
}

// ── Firebase Admin (dynamic import per ESM) ───────────────────────────────────
const { initializeApp, cert, getApps } = await import('firebase-admin/app');
const { getFirestore }                  = await import('firebase-admin/firestore');

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// ── Mapper (inline — replica esatta di idealista-mapper.ts) ──────────────────
const TIPOLOGIA_MAP = {
  'Appartamento':        'flat',
  'Casa/Villa':          'house',
  'Rustico':             'countryhouse',
  'Garage o Posto auto': 'garage',
  'Ufficio':             'office',
  'Locale o Capannone':  'commercial',
  'Terreni':             'land',
  'Cantina':             'storage',
  'Edificio':            'building',
  'Stanza':              'room',
  'Cessione Di Attivita':'commercial',
};

const STATO_MAP = {
  'Nuovo':           'newdevelopment',
  'Ottime':          'good',
  'Buono':           'good',
  'Abitabile':       'good',
  'Da Ristrutturare':'toberestored',
};

function toNum(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(v); return isNaN(n) ? undefined : n;
}

function parseAddr(s) {
  if (!s) return { street: '' };
  const m = s.match(/^(.+?)\s*[,\s]+(?:n\.?\s*)?(\d+\w*)$/);
  return m ? { street: m[1].trim(), streetNumber: m[2] } : { street: s.trim() };
}

function mapProperty(property, contactId = 'DRY-RUN-CONTACT-ID') {
  const db2  = property.DatiBase            || {};
  const df   = property.DettagliFisici      || {};
  const gc   = property.GestioneCommerciale || {};
  const car  = property.Caratteristiche     || {};
  const tex  = property.Textos              || {};

  const operation = (gc.InAffitto && !gc.InVendita) ? 'rent' : 'sale';
  const parsed    = parseAddr(db2.Indirizzo || '');

  const address = {
    street:       parsed.street || 'Via Non Specificata',
    ...(parsed.streetNumber ? { streetNumber: parsed.streetNumber } : {}),
    postalCode:   db2.CAP || '91025',
    town:         db2.Citta || 'Marsala',
    province:     'TP',
    country:      'IT',
    visibility:   'full',
  };

  const type     = TIPOLOGIA_MAP[db2.Tipologia] || 'flat';
  const features = { type };

  const area = toNum(df.MetriCommerciali);
  if (area && area >= 10) features.areaConstructed = area;
  const bed = toNum(df.CamereLetto);  if (bed  !== undefined) features.bedRoomNumber  = bed;
  const bth = toNum(df.Bagni);        if (bth  !== undefined) features.bathRoomNumber = bth;
  const con = STATO_MAP[df.StatoFiniture]; if (con) features.conservation = con;
  if (df.Piano && df.Piano !== '') features.floorNumber = String(df.Piano);
  if (car.Ascensore)        features.hasLift            = true;
  if (car.AriaCondizionata) features.hasAirConditioning = true;
  if (car.Giardino)         features.hasGarden          = true;
  if (car.Terrazza)         features.hasTerrace         = true;
  if (car.Balcone)          features.hasBalcony         = true;
  if (car.Garage || car.PostoAutoScoperto) {
    features.hasParking = true; features.parkingAvailable = true; features.parkingIncludedInPrice = false;
  }
  if (df.ClasseEnergetica && df.ClasseEnergetica !== '')
    features.energyCertificateRating = df.ClasseEnergetica.toLowerCase();

  const priceAmt = operation === 'sale' ? toNum(gc.PrezzoVendita) : toNum(gc.PrezzoAffitto);
  const price    = { amount: priceAmt || 0 };
  const cf       = toNum(gc.SpeseCondominio);
  if (cf && cf > 0) price.communityFees = cf;

  const description = tex.Descrizione ? { it: tex.Descrizione } : undefined;

  return {
    scope: 'idealista', operation, address,
    contact: { contactId },
    ...(description ? { description } : {}),
    features, price,
  };
}

// ── Privacy Audit ─────────────────────────────────────────────────────────────
const PRIVATE_FIELDS = [
  'proprietarioId', 'DatiProprietario', 'Proprietario', 'NotePrivate',
  'Annotazioni', 'Note', 'GestioneCommerciale.CommissioneVenditore',
  'GestioneCommerciale.CommissioneAcquirente', 'GestioneCommerciale.NoteProposta',
  'GestioneCommerciale.MotivazioneVendita', 'Idealista', 'createdAt', 'updatedAt',
];

function getNestedVal(obj, path) {
  return path.split('.').reduce((a, k) => a?.[k], obj);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const codice = process.argv[2] || '1000050';
console.log(`\n🔍 DRY RUN — Rif. ${codice}\n${'─'.repeat(60)}`);

// Cerca per Codice
let property = null;
const q = await db.collection('immobili').where('DatiBase.Codice', '==', codice).limit(1).get();
if (!q.empty) {
  property = { id: q.docs[0].id, ...q.docs[0].data() };
} else {
  // Prova come Firestore ID diretto
  const d = await db.collection('immobili').doc(codice).get();
  if (d.exists) property = { id: d.id, ...d.data() };
}

if (!property) { console.error(`❌ Immobile non trovato: ${codice}`); process.exit(1); }

console.log(`✓ Trovato: Firestore ID = ${property.id}`);
console.log(`  Tipologia: ${property.DatiBase?.Tipologia || 'N/A'}`);
console.log(`  Indirizzo: ${property.DatiBase?.Indirizzo || 'N/A'}, ${property.DatiBase?.Citta || 'N/A'}`);
console.log(`  Prezzo:    ${property.GestioneCommerciale?.PrezzoVendita || property.GestioneCommerciale?.PrezzoAffitto || 'N/A'}`);

// Payload
const payload = mapProperty(property);

// Privacy audit
const payloadStr = JSON.stringify(payload);
const ownerName  = getNestedVal(property, 'DatiProprietario.Nome') || getNestedVal(property, 'Proprietario.nome');
const ownerEmail = getNestedVal(property, 'DatiProprietario.Email') || getNestedVal(property, 'Proprietario.email');
const ownerPhone = getNestedVal(property, 'DatiProprietario.Telefono') || getNestedVal(property, 'Proprietario.telefono');

console.log(`\n${'═'.repeat(60)}`);
console.log('AUDIT PRIVACY');
console.log('═'.repeat(60));

const checks = [
  { label: 'Nome proprietario non nel payload',  pass: !ownerName  || !payloadStr.includes(ownerName)  },
  { label: 'Email proprietario non nel payload', pass: !ownerEmail || !payloadStr.includes(ownerEmail) },
  { label: 'Tel. proprietario non nel payload',  pass: !ownerPhone || !payloadStr.includes(ownerPhone) },
  { label: 'NotePrivate non nel payload',        pass: !payloadStr.includes('NotePrivate')              },
  { label: 'Annotazioni non nel payload',        pass: !payloadStr.includes('Annotazioni')              },
  { label: 'Commissioni non nel payload',        pass: !payloadStr.includes('Commissione')              },
  { label: 'proprietarioId non nel payload',     pass: !payloadStr.includes('proprietarioId')           },
  { label: 'Idealista sync meta non nel payload',pass: !payloadStr.includes('"idealistaStatus"')        },
];

const fieldAudit = PRIVATE_FIELDS.map(f => ({
  field:    f,
  inDB:     getNestedVal(property, f) !== undefined,
  inPayload: payloadStr.includes(f.split('.').pop()),
}));

let allPass = true;
for (const c of checks) {
  console.log(`  ${c.pass ? '✅' : '❌'} ${c.label}`);
  if (!c.pass) allPass = false;
}

console.log(`\n  Verdict: ${allPass ? '✅ CONFORME — Zero data leak' : '❌ ATTENZIONE — Verificare'}`);

console.log(`\n${'═'.repeat(60)}`);
console.log('CAMPI PRIVATI NEL DB vs PAYLOAD');
console.log('═'.repeat(60));
console.log(`  ${'Campo'.padEnd(45)} DB    Payload`);
for (const r of fieldAudit) {
  const inDB  = r.inDB    ? '✓   ' : '–   ';
  const inPay = r.inPayload ? '❌ LEAK!' : '✓ sicuro';
  console.log(`  ${r.field.padEnd(45)} ${inDB}  ${inPay}`);
}

console.log(`\n${'═'.repeat(60)}`);
console.log('PAYLOAD IDEALISTA DEFINITIVO (quello che riceverebbe il server)');
console.log('═'.repeat(60));
console.log(JSON.stringify(payload, null, 2));
console.log(`\n${'═'.repeat(60)}\n`);
