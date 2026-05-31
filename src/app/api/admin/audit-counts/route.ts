import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit-counts  —  ENDPOINT TEMPORAL DE DIAGNÓSTICO
 *
 * Cuantifica los 3 hallazgos del informe que dependían de datos vivos:
 *  - P1 (C2): clientes activos SIN campo `_status` → hoy invisibles a /api/match-inverse,
 *             porque Firestore `where('_status','!=',...)` excluye los docs sin el campo.
 *  - P2 (C3): inmuebles activos SIN `GestioneCommerciale.Sospeso`/`InVendita`/`InAffitto`
 *             → invisibles al listado "attivi", al matching y a stats, porque
 *             `where('...Sospeso','==',false)` excluye los docs sin el campo.
 *  - P3 (D3): reparto `proprietarioId` vs `proprietarioId_real` + inmuebles huérfanos.
 *
 * En Firestore un campo ausente no se puede consultar con where(); por eso se proyectan
 * solo los campos necesarios y se cuenta en JS. Coste mínimo (projection, sin payload grande).
 *
 * Protegido por el middleware (requiere sesión); visítalo logueado en el CRM.
 * Bórralo tras recoger los números (Fase 3).
 */
export async function GET() {
  try {
    const [clientiSnap, immobiliSnap, proprietariSnap] = await Promise.all([
      db.collection('clienti').select('_status').get(),
      db.collection('immobili').select(
        '_status',
        'GestioneCommerciale.Sospeso',
        'GestioneCommerciale.InVendita',
        'GestioneCommerciale.InAffitto',
        'proprietarioId',
        'proprietarioId_real',
        'DatiBase.Codice',
      ).get(),
      db.collection('proprietari').select().get(), // solo IDs, payload mínimo
    ]);

    // ── P1 · clienti ───────────────────────────────────────────────
    let clientiSoftDeleted = 0;
    let clientiSinStatus = 0;
    clientiSnap.docs.forEach((d) => {
      const status = d.data()._status;
      if (status === 'pendente_cancellazione') clientiSoftDeleted++;
      else if (status === undefined || status === null) clientiSinStatus++;
    });
    const clientiTotal = clientiSnap.size;
    const clientiActivos = clientiTotal - clientiSoftDeleted;

    // ── P3 · set de IDs de propietarios existentes (para detectar huérfanos) ──
    const propIds = new Set<string>();
    proprietariSnap.docs.forEach((d) => propIds.add(d.id));

    // ── P2 + P3 · immobili ─────────────────────────────────────────
    let immSoftDeleted = 0;
    let immActivosSinSospeso = 0;
    let immActivosSinInVendita = 0;
    let immActivosSinInAffitto = 0;
    let immActivosSinVenditaNiAffitto = 0;

    let soloPlain = 0;
    let soloReal = 0;
    let ambos = 0;
    let ninguno = 0;
    const huerfanos: Array<{ immobileId: string; codice: string; proprietarioId: string }> = [];

    immobiliSnap.docs.forEach((d) => {
      const data = d.data();

      if (data._status === 'pendente_cancellazione') {
        immSoftDeleted++;
        return;
      }

      // P2 — campos ausentes (Firestore no almacena `undefined`: undefined = campo ausente)
      const gc = data.GestioneCommerciale || {};
      if (gc.Sospeso === undefined) immActivosSinSospeso++;
      if (gc.InVendita === undefined) immActivosSinInVendita++;
      if (gc.InAffitto === undefined) immActivosSinInAffitto++;
      if (gc.InVendita === undefined && gc.InAffitto === undefined) immActivosSinVenditaNiAffitto++;

      // P3 — reparto plain vs _real
      const plain = data.proprietarioId;
      const real = data.proprietarioId_real;
      const hasPlain = typeof plain === 'string' && plain.length > 0;
      const hasReal = typeof real === 'string' && real.length > 0;
      if (hasPlain && hasReal) ambos++;
      else if (hasReal) soloReal++;
      else if (hasPlain) soloPlain++;
      else ninguno++;

      // P3 — huérfano: el propietario referenciado no existe en `proprietari`
      const effective = hasReal ? real : hasPlain ? plain : null;
      if (effective && !propIds.has(effective) && huerfanos.length < 25) {
        huerfanos.push({
          immobileId: d.id,
          codice: String(data.DatiBase?.Codice ?? ''),
          proprietarioId: effective,
        });
      }
    });

    const immTotal = immobiliSnap.size;
    const immActivos = immTotal - immSoftDeleted;

    return NextResponse.json({
      _meta: {
        generatedAt: new Date().toISOString(),
        nota: 'Endpoint TEMPORAL de diagnóstico — bórralo tras recoger los números (Fase 3).',
      },
      P1_clienti_C2: {
        total: clientiTotal,
        softDeleted: clientiSoftDeleted,
        activos: clientiActivos,
        activosSinCampo_status: clientiSinStatus,
        impacto:
          clientiSinStatus > 0
            ? `CONFIRMA C2: ${clientiSinStatus} clientes activos SIN '_status' → hoy invisibles para /api/match-inverse.`
            : "C2 no afecta a datos actuales (todos los clientes activos tienen '_status'), pero el código sigue siendo frágil.",
      },
      P2_immobili_C3: {
        total: immTotal,
        softDeleted: immSoftDeleted,
        activos: immActivos,
        activosSinCampo_Sospeso: immActivosSinSospeso,
        activosSinCampo_InVendita: immActivosSinInVendita,
        activosSinCampo_InAffitto: immActivosSinInAffitto,
        activosSinVenditaNiAffitto: immActivosSinVenditaNiAffitto,
        impacto:
          immActivosSinSospeso > 0
            ? `CONFIRMA C3: ${immActivosSinSospeso} inmuebles activos SIN 'Sospeso' → invisibles al listado "attivi"/match/stats.`
            : "C3 no afecta a datos actuales (todos los inmuebles activos tienen 'Sospeso'), pero el código sigue siendo frágil.",
      },
      P3_proprietarioId_D3: {
        totalImmobili: immTotal,
        conSolo_proprietarioId: soloPlain,
        conSolo_proprietarioId_real: soloReal,
        conAmbosCampos: ambos,
        sinNingunPropietario: ninguno,
        immobiliHuerfanos: huerfanos.length,
        muestraHuerfanos: huerfanos, // máx. 25
        impacto:
          soloPlain > 0 && soloReal > 0
            ? `CONFIRMA D3: campos mezclados (${soloPlain} solo plain, ${soloReal} solo _real) → el fallback de /proprietari/[id]/immobili puede ocultar inmuebles.`
            : 'D3 de bajo riesgo en datos actuales (campo de propietario consistente).',
      },
    });
  } catch (error: any) {
    console.error('[audit-counts]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
