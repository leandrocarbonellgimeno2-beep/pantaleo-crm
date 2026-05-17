/**
 * Shared utility: generates a PDF blob, uploads to Firebase Storage,
 * and saves the metadata to Firestore (documenti_generati collection).
 *
 * Used by all document forms (FoglioVisita, IncaricoAcquisto, etc.)
 */

export interface SaveDocumentOptions {
  /** The react-pdf Document element (already created via React.createElement) */
  docElement: React.ReactElement;
  /** Human-readable document title, e.g. "Foglio di Visita - Mario Rossi" */
  nomeFile: string;
  /** Document category, e.g. "Foglio di Visita", "Incarico Vendita" */
  categoria: string;
  /** Client name (for metadata) */
  clienteNome?: string;
  /** Client Firebase ID (if available) */
  clienteId?: string;
  /** Section context (e.g., 'clienti' or 'proprietari') */
  sezione: string;
  /** Action context (e.g., 'affitto' o 'vendita') */
  azione: string;
  /** Full form data snapshot — persisted to Firestore so the form can be reopened with all fields (including signatures) restored */
  formData?: Record<string, unknown>;
}

export interface SaveDocumentResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

export async function saveDocumentToCloud(opts: SaveDocumentOptions): Promise<SaveDocumentResult> {
  try {
    // 1. Dynamic import of @react-pdf/renderer to get the pdf() function
    const { pdf } = await import('@react-pdf/renderer');

    // 2. Generate the PDF blob
    const blob = await pdf(opts.docElement as any).toBlob();

    // 3. Create a safe filename for Storage
    const timestamp = Date.now();
    const safeName = opts.nomeFile
      .replace(/[^a-zA-Z0-9àèéìòù\s_-]/gi, '')
      .replace(/\s+/g, '_')
      .substring(0, 80);
    const storagePath = `documenti_generati/${safeName}_${timestamp}.pdf`;

    // 4. Upload to Firebase Storage via the existing /api/upload endpoint
    const formData = new FormData();
    const file = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
    formData.append('file', file);
    formData.append('path', storagePath);

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || !uploadData.url) {
      throw new Error(uploadData.error || 'Errore caricamento file su Storage');
    }

    const downloadUrl = uploadData.url;

    // 5. Save metadata to Firestore via /api/documenti-generati
    const metadataRes = await fetch('/api/documenti-generati', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomeFile: opts.nomeFile,
        categoria: opts.categoria,
        urlDownload: downloadUrl,
        dataCreazione: new Date().toISOString(),
        clienteNome: opts.clienteNome || '',
        clienteId: opts.clienteId || '',
        sezione: opts.sezione,
        azione: opts.azione,
        fileName: `${safeName}.pdf`,
        size: blob.size,
        formData: opts.formData || null,
      }),
    });

    if (!metadataRes.ok) {
      const errData = await metadataRes.json();
      throw new Error(errData.error || 'Errore salvataggio metadati');
    }

    return { success: true, downloadUrl };
  } catch (err: any) {
    console.error('saveDocumentToCloud error:', err);
    return { success: false, error: err.message || 'Errore sconosciuto' };
  }
}
