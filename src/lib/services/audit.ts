/**
 * Registro de auditoria — coleccion _audit_logs.
 *
 * Responde a "quien toco que y cuando" para las acciones que importan. No se
 * registra todo: solo lo destructivo y lo que cambia permisos o credenciales.
 *
 * CINCO DECISIONES, Y EL PORQUE DE CADA UNA
 *
 * 1. EL CORREO DEL ACTOR Y LA ETIQUETA DEL OBJETIVO VAN DESNORMALIZADOS. Cuando
 *    el cron purgue un inmueble, este registro debe seguir diciendo "Rif. 1001",
 *    no un id huerfano que ya no resuelve a nada. Un log que apunta a un
 *    documento borrado no sirve para nada, y esto es lo que hace que sobreviva
 *    al borrado.
 *
 * 2. SOLO NOMBRES DE CAMPO, JAMAS VALORES. Guardar el antes y el despues
 *    duplicaria la base de datos y meteria datos personales de clientes y
 *    firmas en base64 dentro de los registros, que es precisamente lo que un
 *    registro de auditoria no debe contener. Se guarda
 *    ['DatiBase.Prezzo', 'GestioneCommerciale.Sospeso']: responde a "que toco"
 *    sin replicar el dato.
 *
 * 3. CADUCAN SOLOS. Cada entrada lleva expiresAt a un ano vista y Firestore la
 *    borra con su politica TTL nativa, sin cron adicional. Es el mismo patron
 *    que ya usa _rate_limits. Esta es la respuesta a "como aguantar los logs
 *    sin saturar la base": no crecen indefinidamente.
 *
 * 4. NO BLOQUEAN NI TUMBAN NADA. El registro se escribe con after(), que Next
 *    ejecuta DESPUES de haber enviado la respuesta. El usuario no espera por
 *    el, y si falla no se entera: guardar un inmueble jamas debe fallar porque
 *    el log tuvo un problema. Un simple fire-and-forget no valdria: en
 *    serverless la funcion se congela al responder y la escritura se perderia.
 *
 * 5. SIN PARTICIONADO, A PROPOSITO. Con solo acciones criticas y cuatro agentes
 *    son unos cientos de escrituras al dia. Si algun dia llegaran a millones se
 *    particiona por mes; mencionarlo ahora seria sobreingenieria.
 */
import { after } from 'next/server';

const COLLECTION = '_audit_logs';
const RETENCION_MS = 365 * 24 * 60 * 60 * 1000;

export type AuditOutcome = 'ok' | 'denied' | 'error';

export interface AuditTarget {
  collection: string;
  id: string;
  /** Etiqueta legible, desnormalizada a proposito: sobrevive al borrado. */
  label?: string;
}

export interface AuditEntry {
  actorEmail: string;
  actorRole: string;
  action: string;
  target?: AuditTarget;
  /** SOLO nombres de campo. Nunca valores. */
  changedFields?: string[];
  ip?: string;
  outcome?: AuditOutcome;
}

/**
 * Aplana un objeto a rutas con punto, quedandose solo con los NOMBRES.
 *
 * Se usa para rellenar changedFields a partir del cuerpo ya saneado de una
 * peticion. Limita la profundidad y el numero de claves porque un cuerpo
 * enorme no debe convertirse en un registro enorme.
 */
export function nombresDeCampos(obj: unknown, prefijo = '', profundidad = 0): string[] {
  if (profundidad > 3 || obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefijo ? [prefijo] : [];
  }
  const salida: string[] = [];
  for (const clave of Object.keys(obj as Record<string, unknown>)) {
    if (salida.length >= 60) break;
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    const valor = (obj as Record<string, unknown>)[clave];
    if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
      salida.push(...nombresDeCampos(valor, ruta, profundidad + 1));
    } else {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Deja constancia de una accion.
 *
 * No se espera y no lanza nunca. Llamarla es seguro desde cualquier punto de
 * una ruta, incluso dentro de un try/catch que no deberia capturarla.
 */
export function audit(entrada: AuditEntry): void {
  try {
    after(async () => {
      try {
        const { db, admin } = await import('@/lib/firebase-admin');
        const ahora = Date.now();

        await db.collection(COLLECTION).add({
          at: admin.firestore.Timestamp.fromMillis(ahora),
          actorEmail: entrada.actorEmail ?? '',
          actorRole: entrada.actorRole ?? '',
          action: entrada.action,
          target: entrada.target ?? null,
          // Se recorta por si alguien pasa un objeto gigante: el registro tiene
          // que seguir siendo un registro, no una copia del documento.
          changedFields: (entrada.changedFields ?? []).slice(0, 60),
          ip: entrada.ip ?? '',
          outcome: entrada.outcome ?? 'ok',
          // Politica TTL de Firestore sobre este campo: la entrada desaparece
          // sola al ano. Hay que activarla una vez en la consola.
          expiresAt: admin.firestore.Timestamp.fromMillis(ahora + RETENCION_MS),
        });
      } catch (e: any) {
        console.error('[audit] no se pudo registrar la accion:', entrada.action, e?.message);
      }
    });
  } catch (e: any) {
    // after() solo funciona dentro del ciclo de una peticion. Si se llamara
    // desde otro contexto, no se rompe nada: se pierde el registro y se avisa.
    console.error('[audit] fuera del ciclo de peticion:', entrada.action, e?.message);
  }
}
