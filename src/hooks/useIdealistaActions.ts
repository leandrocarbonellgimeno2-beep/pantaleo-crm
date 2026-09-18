"use client";

import { useState } from 'react';
import { toast } from 'sonner';

export type IdealistaAction = 'publish' | 'update' | 'deactivate' | 'activate';

/**
 * Subconjunto de las opciones de useConfirm que este hook necesita. Se declara
 * aquí porque ConfirmOptions no se exporta desde el contexto, y así el hook no
 * depende de su forma completa.
 */
interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

interface ActionConfig {
  endpoint: string;
  method: 'POST' | 'PUT';
  /** Solo deactivate pide confirmación antes de salir del portal. */
  confirm?: ConfirmRequest;
  successTitle: (codice: string) => string;
  successDescription: string;
  errorTitle: string;
  /** Parche al bloque Idealista cuando la llamada va bien. */
  patchOnSuccess?: (data: any) => Record<string, unknown>;
  /** Parche cuando el servidor responde con error (solo publish lo registra). */
  patchOnError?: (data: any) => Record<string, unknown>;
}

const CONFIG: Record<IdealistaAction, ActionConfig> = {
  publish: {
    endpoint: '/api/idealista/properties',
    method: 'POST',
    successTitle: (c) => `Rif. ${c} pubblicato su Idealista`,
    successDescription: "L'immobile è ora visibile sul portale.",
    errorTitle: 'Errore pubblicazione Idealista',
    patchOnSuccess: (data) => ({
      idealistaPropertyId: data.idealistaPropertyId,
      idealistaStatus: 'active',
      idealistaError: null,
    }),
    patchOnError: (data) => ({
      idealistaStatus: 'error',
      idealistaError: data.error,
    }),
  },
  update: {
    endpoint: '/api/idealista/properties',
    method: 'PUT',
    successTitle: (c) => `Rif. ${c} aggiornato su Idealista`,
    successDescription: 'Le modifiche sono state sincronizzate.',
    errorTitle: 'Errore aggiornamento Idealista',
  },
  deactivate: {
    endpoint: '/api/idealista/properties/deactivate',
    method: 'POST',
    confirm: {
      title: 'Disattivare da Idealista?',
      message: "L'immobile verrà rimosso dal portale pubblico. Potrai ripubblicarlo successivamente.",
      confirmLabel: 'Disattiva',
      danger: true,
    },
    successTitle: (c) => `Rif. ${c} rimosso da Idealista`,
    successDescription: "L'immobile non è più visibile sul portale.",
    errorTitle: 'Errore rimozione Idealista',
    patchOnSuccess: () => ({ idealistaStatus: 'deactivated' }),
  },
  activate: {
    endpoint: '/api/idealista/properties/activate',
    method: 'POST',
    successTitle: (c) => `Rif. ${c} riattivato su Idealista`,
    successDescription: "L'immobile è di nuovo visibile sul portale.",
    errorTitle: 'Errore riattivazione Idealista',
    patchOnSuccess: () => ({ idealistaStatus: 'active' }),
  },
};

interface UseIdealistaActionsOptions {
  propertyId: string | undefined;
  /** Código del inmueble, solo para los mensajes. */
  codice: string;
  /**
   * Aplica un parche al bloque Idealista del inmueble en memoria.
   * El hook recibe un parche en vez del setter completo, para no volver a
   * acoplarse a la forma entera de selectedProperty.
   */
  onPatch: (patch: Record<string, unknown>) => void;
  /** Diálogo de confirmación; la forma coincide con la de useConfirm. */
  confirm: (opts: ConfirmRequest) => Promise<boolean>;
}

/**
 * Las cuatro acciones de Idealista (publicar, actualizar, desactivar,
 * reactivar). Eran cuatro handlers de ~50 líneas con el mismo
 * try/catch/finally y los mismos toasts; la diferencia real entre ellos es
 * la tabla CONFIG de arriba.
 */
export function useIdealistaActions({
  propertyId,
  codice,
  onPatch,
  confirm,
}: UseIdealistaActionsOptions) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<IdealistaAction | null>(null);

  const run = async (name: IdealistaAction) => {
    if (!propertyId) return;
    const cfg = CONFIG[name];

    if (cfg.confirm && !(await confirm(cfg.confirm))) return;

    setLoading(true);
    setAction(name);
    try {
      const res = await fetch(cfg.endpoint, {
        method: cfg.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();

      if (res.ok) {
        if (cfg.patchOnSuccess) onPatch(cfg.patchOnSuccess(data));
        toast.success(cfg.successTitle(codice), { description: cfg.successDescription });
      } else {
        if (cfg.patchOnError) onPatch(cfg.patchOnError(data));
        toast.error(cfg.errorTitle, {
          description: data.error || 'Errore sconosciuto',
          duration: 8000,
        });
      }
    } catch (err: any) {
      toast.error('Errore di rete', {
        description: `Impossibile contattare il server: ${err.message}`,
        duration: 8000,
      });
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  return {
    loading,
    action,
    publish: () => run('publish'),
    update: () => run('update'),
    deactivate: () => run('deactivate'),
    activate: () => run('activate'),
  };
}
