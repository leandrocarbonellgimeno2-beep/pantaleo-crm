import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginaLegale } from '@/components/legal/PaginaLegale';
import { valorParaMostrar } from '@/lib/datos-titular';
import { leerDatosTitular } from '@/lib/services/datos-titular';
import { urlDelSitio } from '@/lib/site-url';

export const metadata: Metadata = {
  title: 'Termini di Servizio | Immobiliare Pantaleo',
  description:
    'Condizioni di utilizzo del gestionale interno di Immobiliare Pantaleo.',
  alternates: { canonical: `${urlDelSitio()}/terms` },
};


/**
 * SIEMPRE EN VIVO, sin cache.
 *
 * Los datos de la agencia los edita Francesco desde Administracion, y un
 * cambio tiene que verse al recargar, no en el siguiente despliegue. Es
 * ademas la pagina que Google revisa a mano para publicar la aplicacion
 * OAuth: servir una version vieja ahi es servir un documento legal que no
 * es el vigente.
 *
 * El coste es una lectura de Firestore por visita, y estas dos paginas
 * reciben unas pocas. La ruta de guardado ademas invalida el cache por si
 * alguien las pasa algun dia a estaticas.
 */
export const dynamic = 'force-dynamic';

export default async function TermsPage() {
  const { datos, actualizadoAt } = await leerDatosTitular();

  return (
    <PaginaLegale
      titulo="Termini di Servizio"
      subtitulo="Condizioni di utilizzo del gestionale interno dell'Agenzia."
      datos={datos}
      actualizadoAt={actualizadoAt}
    >
      <h2>1. Oggetto e titolarità</h2>
      <p>
        Le presenti condizioni disciplinano l&apos;utilizzo del gestionale interno (di
        seguito, «il Servizio») di <strong>{valorParaMostrar(datos, 'razonSocial')}</strong>, con sede in{' '}
        {valorParaMostrar(datos, 'direccion')}, P. IVA / C.F. {valorParaMostrar(datos, 'partitaIva')} (di seguito, «l&apos;Agenzia»).
      </p>
      <p>
        Il Servizio è uno <strong>strumento di lavoro ad accesso riservato</strong>: non è
        rivolto al pubblico e non consente la registrazione autonoma. L&apos;accesso è
        consentito unicamente ai collaboratori ai quali l&apos;Agenzia abbia rilasciato
        credenziali personali.
      </p>

      <h2>2. Account e credenziali</h2>
      <ul>
        <li>
          Le credenziali sono <strong>personali e non cedibili</strong>. L&apos;utente è
          responsabile di ogni attività svolta con il proprio account.
        </li>
        <li>
          L&apos;utente si impegna a custodire la password e a comunicare senza ritardo
          all&apos;Agenzia qualunque accesso non autorizzato o sospetto.
        </li>
        <li>
          L&apos;Agenzia può <strong>sospendere o revocare</strong> l&apos;accesso in
          qualsiasi momento, in particolare al cessare del rapporto di collaborazione. La
          revoca ha effetto immediato.
        </li>
        <li>
          Le operazioni critiche compiute nel Servizio sono <strong>registrate</strong>, con
          indicazione di autore, data e tipo di operazione.
        </li>
      </ul>

      <h2>3. Uso consentito</h2>
      <p>
        Il Servizio va utilizzato esclusivamente per l&apos;attività di mediazione
        immobiliare dell&apos;Agenzia. In particolare è <strong>vietato</strong>:
      </p>
      <ul>
        <li>
          estrarre, copiare o trasferire fuori dal Servizio archivi di clienti, proprietari o
          immobili per finalità estranee all&apos;attività dell&apos;Agenzia;
        </li>
        <li>
          comunicare a terzi dati personali presenti nel Servizio al di fuori dei casi
          previsti dall&apos;incarico ricevuto o da un obbligo di legge;
        </li>
        <li>
          inserire dati falsi, inesatti o relativi a persone che non hanno avuto alcun
          rapporto con l&apos;Agenzia;
        </li>
        <li>
          tentare di accedere a funzioni o dati per i quali il proprio profilo non è
          abilitato, o aggirare in qualsiasi modo i controlli di accesso;
        </li>
        <li>
          utilizzare il Servizio per inviare comunicazioni commerciali a soggetti che non
          abbiano prestato il relativo consenso.
        </li>
      </ul>

      <h2>4. Documenti generati e firme</h2>
      <p>
        Il Servizio consente di generare documenti (fogli di visita, incarichi e simili) e di
        raccogliere una <strong>firma grafometrica semplice</strong> su dispositivo touch.
      </p>
      <ul>
        <li>
          L&apos;utente è responsabile della corrispondenza tra il documento sottoscritto e
          quanto effettivamente concordato con l&apos;interessato.
        </li>
        <li>
          La firma va raccolta <strong>in presenza del firmatario</strong>, dopo che questi
          ha potuto leggere il documento.
        </li>
        <li>
          I documenti firmati <strong>non vengono eliminati definitivamente</strong> dal
          Servizio: l&apos;eliminazione li rimuove dall&apos;elenco ma il documento resta
          conservato, in quanto costituisce documentazione dell&apos;attività svolta.
        </li>
      </ul>

      <h2>5. Disponibilità del Servizio</h2>
      <p>
        L&apos;Agenzia si adopera per mantenere il Servizio disponibile e aggiornato, ma{' '}
        <strong>non garantisce la continuità assoluta</strong> del funzionamento: il Servizio
        dipende da fornitori terzi di infrastruttura e può essere sospeso per manutenzione,
        aggiornamenti o cause non imputabili all&apos;Agenzia.
      </p>
      <p>
        Le funzioni che dipendono da servizi esterni — in particolare la sincronizzazione con
        il calendario e la pubblicazione sui portali immobiliari — possono risultare
        temporaneamente indisponibili per cause riconducibili a tali servizi.
      </p>

      <h2>6. Proprietà intellettuale</h2>
      <p>
        Il software, la struttura del Servizio, i marchi e i contenuti messi a disposizione
        dall&apos;Agenzia sono di titolarità dell&apos;Agenzia o dei rispettivi licenzianti.
        L&apos;accesso al Servizio non comporta alcuna cessione di diritti.
      </p>
      <p>
        I dati relativi a clienti, proprietari e immobili inseriti nel Servizio restano{' '}
        <strong>di titolarità dell&apos;Agenzia</strong> e non possono essere utilizzati per
        finalità proprie dell&apos;utente.
      </p>

      <h2>7. Limitazione di responsabilità</h2>
      <p>
        Nei limiti consentiti dalla legge, l&apos;Agenzia non risponde dei danni derivanti
        da: uso del Servizio difforme dalle presenti condizioni; inserimento di dati errati
        da parte dell&apos;utente; indisponibilità temporanea di servizi di terzi; accessi
        non autorizzati riconducibili alla mancata custodia delle credenziali.
      </p>
      <p>
        Nessuna disposizione delle presenti condizioni esclude o limita la responsabilità
        nei casi in cui ciò non sia consentito dalla normativa applicabile.
      </p>

      <h2>8. Protezione dei dati personali</h2>
      <p>
        Il trattamento dei dati personali è descritto nell&apos;
        <Link href="/privacy">Informativa sulla Privacy</Link>, che costituisce parte
        integrante delle presenti condizioni. Gli utenti del Servizio trattano i dati
        personali <strong>per conto dell&apos;Agenzia</strong> e sono tenuti a rispettare le
        istruzioni ricevute e la normativa vigente.
      </p>

      <h2>9. Modifiche</h2>
      <p>
        L&apos;Agenzia può aggiornare le presenti condizioni. La versione vigente è sempre
        disponibile a questo indirizzo, con indicazione della data di ultimo aggiornamento.
        L&apos;uso del Servizio successivo alla pubblicazione comporta accettazione delle
        condizioni aggiornate.
      </p>

      <h2>10. Legge applicabile e foro competente</h2>
      <p>
        Le presenti condizioni sono regolate dalla <strong>legge italiana</strong>. Per ogni
        controversia è competente il foro di <strong>{valorParaMostrar(datos, 'foro')}</strong>, salvo diversa
        competenza inderogabile prevista dalla legge.
      </p>

      <h2>11. Contatti</h2>
      <p>
        Per qualsiasi comunicazione relativa al Servizio:{' '}
        <strong>{valorParaMostrar(datos, 'emailContacto')}</strong> — {valorParaMostrar(datos, 'telefono')}.
      </p>
    </PaginaLegale>
  );
}
