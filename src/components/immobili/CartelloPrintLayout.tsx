"use client";

interface CartelloPrintLayoutProps {
  property: any;
  /** Fotos elegidas en el selector de impresión (máximo 4). */
  photos: string[];
  /** Texto libre que sustituye a la descripción en el cartel. */
  customText: string;
}

/**
 * Cartel A4 de escaparate. Oculto en pantalla y revelado solo al imprimir.
 *
 * El id "cartello-vetrina-print" es LOAD-BEARING: globals.css esconde todo el
 * documento en @media print y revela únicamente este nodo por ese selector.
 * Cambiarlo deja la impresión en blanco.
 *
 * Usa estilos en línea a propósito: las utilidades de Tailwind se generan sin
 * !important y las reglas de impresión de globals.css sí lo llevan, así que
 * perderían.
 */
export function CartelloPrintLayout({ property, photos, customText }: CartelloPrintLayoutProps) {
  return (
    <div
      id="cartello-vetrina-print"
      style={{ display: 'none', width: '210mm', minHeight: '297mm', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <div style={{ width: '210mm', height: '297mm', position: 'relative', overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        
        {/* Hero Photo — Top 55% */}
        <div style={{ position: 'relative', flex: '0 0 55%', overflow: 'hidden', background: '#f1f5f9' }}>
          {photos?.[0] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[0]}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {/* Gradient overlay bottom */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '18px', fontWeight: 600 }}>
              Nessuna foto disponibile
            </div>
          )}
          
          {/* Price Badge — floating on photo */}
          <div style={{ position: 'absolute', bottom: '24px', right: '28px', background: '#4f46e5', color: 'white', padding: '12px 28px', borderRadius: '16px', fontSize: '28px', fontWeight: 900, letterSpacing: '-0.5px', boxShadow: '0 4px 20px rgba(79,70,229,0.4)' }}>
            {property.GestioneCommerciale?.InVendita && (
              <span>€ {Number(property.GestioneCommerciale?.PrezzoVendita || 0).toLocaleString()}</span>
            )}
            {property.GestioneCommerciale?.InVendita && property.GestioneCommerciale?.InAffitto && (
              <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
            )}
            {property.GestioneCommerciale?.InAffitto && (
              <span>€ {Number(property.GestioneCommerciale?.PrezzoAffitto || 0).toLocaleString()}/mese</span>
            )}
            {!property.GestioneCommerciale?.InVendita && !property.GestioneCommerciale?.InAffitto && (
              <span>Prezzo su richiesta</span>
            )}
          </div>

          {/* Status badge — top left */}
          <div style={{ position: 'absolute', top: '20px', left: '24px', display: 'flex', gap: '8px' }}>
            {property.GestioneCommerciale?.InVendita && (
              <span style={{ background: '#4f46e5', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Vendita
              </span>
            )}
            {property.GestioneCommerciale?.InAffitto && (
              <span style={{ background: '#f59e0b', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Affitto
              </span>
            )}
          </div>
        </div>

        {/* Content — Bottom 45% */}
        <div style={{ flex: 1, padding: '28px 32px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          {/* Property Info */}
          <div>
            {/* Tipologia + Location */}
            <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', margin: '0 0 6px', lineHeight: 1.15 }}>
              {property.DatiBase?.Tipologia || 'Immobile'}
              {property.DatiBase?.Citta ? ` a ${property.DatiBase.Citta}` : ''}
            </h1>
            <p style={{ fontSize: '16px', color: '#64748b', fontWeight: 600, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📍 {property.DatiBase?.Indirizzo || 'Indirizzo non specificato'}
              {property.DatiBase?.Zona ? `, ${property.DatiBase.Zona}` : ''}
            </p>

            {/* Specs Grid */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {property.DettagliFisici?.MetriCommerciali && (
                <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '14px', padding: '14px 22px', textAlign: 'center', minWidth: '110px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{property.DettagliFisici.MetriCommerciali}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>MQ</div>
                </div>
              )}
              {property.DettagliFisici?.CamereLetto && (
                <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '14px', padding: '14px 22px', textAlign: 'center', minWidth: '110px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{property.DettagliFisici.CamereLetto}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>Camere</div>
                </div>
              )}
              {property.DettagliFisici?.Bagni && (
                <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '14px', padding: '14px 22px', textAlign: 'center', minWidth: '110px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{property.DettagliFisici.Bagni}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>Bagni</div>
                </div>
              )}
              {property.DettagliFisici?.Piano && (
                <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '14px', padding: '14px 22px', textAlign: 'center', minWidth: '110px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{property.DettagliFisici.Piano}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>Piano</div>
                </div>
              )}
            </div>

            {/* Description Text (from print selector) */}
            {customText && (
              <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.7, margin: '0 0 14px', maxHeight: '80px', overflow: 'hidden', fontWeight: 500 }}>
                {customText.substring(0, 350)}{customText.length > 350 ? '...' : ''}
              </p>
            )}

            {/* Additional photos row */}
            {photos.length > 1 && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                {photos.slice(1, 4).map((photo, idx) => (
                  <div key={idx} style={{ flex: 1, height: '90px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #e2e8f0' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer — Agency Brand */}
          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
                Pantaleo Real Estate
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                Il tuo partner immobiliare di fiducia
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                Rif: {property.DatiBase?.Codice || 'N/A'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                📞 Contattaci per info
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
