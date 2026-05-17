import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Añade una página legal de privacidad al final de un documento PDF.
 * Si se proporciona la URL o base64 de la firma, la estampa al final.
 */
export async function appendLegalPrivacyPage(pdfDoc: PDFDocument, firmaUrl?: string) {
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Título legal
  page.drawText('Informativa sulla Privacy', {
    x: 50,
    y: height - 80,
    size: 18,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText('Immobiliare Pantaleo - Decreto Legislativo n. 196 del 30 giugno 2003', {
    x: 50,
    y: height - 110,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Texto legal estándar
  const privacyText = `
Ai sensi dell'art. 13 del D.Lgs. 196/2003 e dell'art. 13 del Regolamento UE 2016/679 (GDPR), 
La informiamo che i Suoi dati personali saranno trattati da Immobiliare Pantaleo per le 
finalita' inerenti all'erogazione dei servizi richiesti (es. compravendita, locazione, 
valutazione immobili). 

Il trattamento verra' effettuato con l'ausilio di strumenti informatici e cartacei, nel 
rispetto delle misure di sicurezza previste dalla legge. Il conferimento dei dati e' 
facoltativo, ma l'eventuale rifiuto potra' comportare l'impossibilita' di fornire il servizio.

Si dichiara inoltre che:
1. I dati non saranno diffusi a terzi senza esplicito consenso, salvo obblighi di legge.
2. E' possibile in qualsiasi momento esercitare i diritti di accesso, rettifica, 
   cancellazione e limitazione del trattamento contattando il Titolare del Trattamento.

FIRMA PER LETTURA E ACCETTAZIONE:
  `;

  page.drawText(privacyText, {
    x: 50,
    y: height - 160,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
    lineHeight: 16,
  });

  // Dibujar firma
  if (firmaUrl) {
    try {
      let imageObj;
      let firmBytes;
      
      if (firmaUrl.startsWith('data:image')) {
        // Base64
        const parts = firmaUrl.split(',');
        const base64Data = parts[1];
        firmBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        if (firmaUrl.includes('image/png')) {
          imageObj = await pdfDoc.embedPng(firmBytes);
        } else {
          imageObj = await pdfDoc.embedJpg(firmBytes);
        }
      } else {
        // URL remota (Fetch)
        const res = await fetch(firmaUrl);
        firmBytes = await res.arrayBuffer();
        
        // Asume PNG o JPG dependiendo de la cabecera / extensión
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('png') || firmaUrl.toLowerCase().endsWith('.png')) {
          imageObj = await pdfDoc.embedPng(firmBytes);
        } else {
          imageObj = await pdfDoc.embedJpg(firmBytes);
        }
      }

      if (imageObj) {
        // Escalar la imagen a un tamaño razonable
        const imgDims = imageObj.scale(0.5);
        page.drawImage(imageObj, {
          x: 50,
          y: height - 500,
          width: imgDims.width,
          height: imgDims.height,
        });
      }
    } catch (error) {
       console.error("Errore nell'incorporare la firma: ", error);
       page.drawText('(Errore nel caricamento della firma digitale)', {
         x: 50,
         y: height - 420,
         size: 10,
         color: rgb(1, 0, 0)
       });
    }
  } else {
    // Espacio para la firma en blanco
    page.drawLine({
      start: { x: 50, y: height - 450 },
      end: { x: 250, y: height - 450 },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
  }
}

/**
 * Compila un Smart Document escribiendo encima del primer template 
 * y añade la página legal al final.
 */
export async function compileSmartDocument(
  templateUrl: string, 
  cliente: any, 
  immobile: any
): Promise<Uint8Array> {
  // Descargar el template
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error("Errore nel download del template.");
  const templateBytes = await res.arrayBuffer();
  
  // Cargar el documento PDF a modificar
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();
  
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // === Rellenar el Documento ===
  // Nota: Estas coordenadas son referenciales (arriba a la derecha/izquierda) 
  // ya que no sabemos la posición exacta de un PDF desconocido.
  // Pero escribiremos encima de forma notoria como un comprobante rápido.
  
  // Banda de agua o cabecera auto-creada por encima del original
  firstPage.drawRectangle({
    x: 0,
    y: height - 60,
    width,
    height: 60,
    color: rgb(0.95, 0.95, 0.97),
  });

  firstPage.drawText(`COMPILATO TRAMITE PANTALEO CRM`, {
    x: 20,
    y: height - 25,
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.5),
  });

  // Datos del Cliente (Esquina superior izquierda)
  if (cliente) {
    const nomeCompleto = `${cliente.DatiPersonali?.Nome || cliente.nome || ''} ${cliente.DatiPersonali?.Cognome || cliente.cognome || ''}`;
    const cf = cliente.DatiPersonali?.CodiceFiscale || 'N/A';
    
    firstPage.drawText(`CLIENTE: ${nomeCompleto}`, {
      x: 20,
      y: height - 50,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    firstPage.drawText(`C.F.: ${cf}`, {
      x: 20,
      y: height - 70, // Cae en el documento
      size: 9,
      font: font,
    });
  }

  // Datos Inmueble (Esquina superior derecha)
  if (immobile) {
    const indirizzo = immobile.DatiBase?.Indirizzo || immobile.titolo || '';
    const citta = immobile.DatiBase?.Citta || '';
    const loc = `${indirizzo}, ${citta}`;
    const ref = immobile.DatiBase?.Codice || immobile.rif || 'N/D';
    
    firstPage.drawText(`IMMOBILE (RIF: ${ref})`, {
      x: width - 250,
      y: height - 50,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    firstPage.drawText(`${loc}`, {
      x: width - 250,
      y: height - 70,
      size: 9,
      font: font,
    });
  }

  // === Aplicar REGLA DE PRIVACIDAD ===
  const firmaDigitalUrl = cliente?.FirmaDigitale?.UrlFirma || null;
  await appendLegalPrivacyPage(pdfDoc, firmaDigitalUrl);

  // Serializar el PDF final
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
