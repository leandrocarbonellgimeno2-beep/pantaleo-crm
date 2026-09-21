import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legal/PaginaLegale';
import { valorParaMostrar } from '@/lib/datos-titular';
import { leerDatosTitular } from '@/lib/services/datos-titular';
import { urlDelSitio } from '@/lib/site-url';

export const metadata: Metadata = {
  title: 'Informativa sulla Privacy | Immobiliare Pantaleo',
  description:
    'Informativa sul trattamento dei dati personali ai sensi del Regolamento (UE) 2016/679 (GDPR).',
  alternates: { canonical: `${urlDelSitio()}/privacy` },
};


/**
 * SIEMPRE EN VIVO, sin cache.
 *
 * Los datos de la agencia los edita Francesco desde Administracion, y un
 * cambio tiene que verse al recargar, no en el siguiente despliegue: servir
 * una version vieja aqui es publicar un documento legal que no es el
 * vigente, y estas dos paginas son el texto al que se remite a clientes y
 * proprietari.
 *
 * El coste es una lectura de Firestore por visita, y estas dos paginas
 * reciben unas pocas. La ruta de guardado ademas invalida el cache por si
 * alguien las pasa algun dia a estaticas.
 */
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const { datos, actualizadoAt } = await leerDatosTitular();

  return (
    <PaginaLegale
      titulo="Informativa sulla Privacy"
      subtitulo="Trattamento dei dati personali ai sensi del Regolamento (UE) 2016/679 (GDPR)."
      datos={datos}
      actualizadoAt={actualizadoAt}
    >
      <h2>1. Titolare del trattamento</h2>
      <p>
        Il titolare del trattamento dei dati personali è <strong>{valorParaMostrar(datos, 'razonSocial')}</strong>,
        con sede in {valorParaMostrar(datos, 'direccion')}, P. IVA / C.F. {valorParaMostrar(datos, 'partitaIva')} (di seguito,
        «l&apos;Agenzia»).
      </p>
      <p>
        Per qualsiasi questione relativa alla protezione dei dati è possibile scrivere a{' '}
        <strong>{valorParaMostrar(datos, 'emailPrivacidad')}</strong> o telefonare al {valorParaMostrar(datos, 'telefono')}.
      </p>

      <h2>2. A chi si rivolge questa informativa</h2>
      <p>
        Questa informativa riguarda i dati trattati attraverso il gestionale interno
        dell&apos;Agenzia (di seguito, «il CRM»), che è uno strumento di lavoro{' '}
        <strong>ad accesso riservato</strong>: vi accedono esclusivamente i collaboratori
        autorizzati dell&apos;Agenzia, con credenziali personali.
      </p>
      <p>Le categorie di interessati sono:</p>
      <ul>
        <li>
          <strong>Clienti e potenziali acquirenti o conduttori</strong> che manifestano
          interesse per un immobile o richiedono una valutazione.
        </li>
        <li>
          <strong>Proprietari</strong> che affidano un immobile all&apos;Agenzia per la
          vendita o la locazione.
        </li>
        <li>
          <strong>Collaboratori dell&apos;Agenzia</strong> che utilizzano il CRM.
        </li>
      </ul>

      <h2>3. Quali dati trattiamo</h2>

      <h3>3.1 Dati di clienti e proprietari</h3>
      <ul>
        <li>
          <strong>Dati anagrafici e di contatto:</strong> nome, cognome, indirizzo di
          residenza, telefono, indirizzo e-mail.
        </li>
        <li>
          <strong>Dati identificativi e fiscali:</strong> codice fiscale, partita IVA,
          estremi del documento d&apos;identità, quando necessari per la stipula di un
          contratto o per obblighi di legge.
        </li>
        <li>
          <strong>Dati relativi all&apos;immobile:</strong> indirizzo, dati catastali,
          planimetrie, atti, visure, fotografie, prezzo richiesto e condizioni.
        </li>
        <li>
          <strong>Preferenze di ricerca:</strong> tipologia, zona, budget e caratteristiche
          desiderate, utilizzate per proporre immobili pertinenti.
        </li>
        <li>
          <strong>Firma grafometrica semplice</strong> apposta sui documenti generati dal
          CRM (in particolare i fogli di visita), acquisita tramite dispositivo touch e
          conservata come immagine allegata al documento firmato.
        </li>
        <li>
          <strong>Appuntamenti:</strong> data, ora, luogo e persona di riferimento.
        </li>
      </ul>
      <p>
        L&apos;Agenzia <strong>non richiede né tratta intenzionalmente categorie particolari
        di dati</strong> (art. 9 GDPR). Si invitano gli interessati a non inserire nei campi
        liberi (note, descrizioni) informazioni relative a salute, opinioni politiche,
        convinzioni religiose o altri dati particolari.
      </p>

      <h3>3.2 Dati dei collaboratori e dati tecnici</h3>
      <ul>
        <li>
          Credenziali di accesso (indirizzo e-mail e password conservata esclusivamente in
          forma cifrata con funzione di derivazione <em>scrypt</em>: la password in chiaro
          non è conosciuta né recuperabile dall&apos;Agenzia).
        </li>
        <li>
          <strong>Registri di attività:</strong> data, ora, autore e tipo di operazione
          sulle azioni critiche (creazione, modifica ed eliminazione di schede), indirizzo
          IP e pagina in uso. Tali registri conservano i <em>nomi</em> dei campi modificati,
          non il loro contenuto.
        </li>
        <li>
          <strong>Cookie tecnico di sessione</strong> (<code>pantaleo_session</code>),
          necessario per mantenere l&apos;autenticazione. Non vengono utilizzati cookie di
          profilazione né strumenti di analisi comportamentale.
        </li>
      </ul>

      <h2>4. Finalità e basi giuridiche</h2>
      <ul>
        <li>
          <strong>Erogazione del servizio di mediazione immobiliare</strong> — esecuzione di
          un contratto o di misure precontrattuali (art. 6.1.b GDPR).
        </li>
        <li>
          <strong>Adempimento di obblighi di legge</strong> — obblighi civilistici, fiscali e
          in materia di antiriciclaggio, inclusa la conservazione dei documenti sottoscritti
          (art. 6.1.c GDPR).
        </li>
        <li>
          <strong>Abbinamento tra richieste e immobili</strong> e proposta di immobili
          pertinenti — legittimo interesse dell&apos;Agenzia a svolgere la propria attività e
          interesse dell&apos;interessato a ricevere proposte utili (art. 6.1.f GDPR).
        </li>
        <li>
          <strong>Sicurezza del sistema</strong> e tracciabilità delle operazioni sui dati —
          legittimo interesse (art. 6.1.f GDPR).
        </li>
        <li>
          <strong>Pubblicazione dell&apos;annuncio sui portali immobiliari</strong> — su
          indicazione del proprietario, nell&apos;ambito dell&apos;incarico conferito
          (art. 6.1.b GDPR). Vengono pubblicati i dati dell&apos;immobile, mai i dati
          personali del proprietario.
        </li>
        <li>
          <strong>Comunicazioni commerciali non richieste</strong> — soltanto previo{' '}
          <strong>consenso</strong> espresso e revocabile in qualsiasi momento
          (art. 6.1.a GDPR).
        </li>
      </ul>

      <h2>5. Destinatari dei dati</h2>
      <p>
        I dati non sono diffusi. Possono essere trattati, in qualità di responsabili del
        trattamento (art. 28 GDPR), dai fornitori che erogano l&apos;infrastruttura
        tecnica del CRM:
      </p>
      <ul>
        <li>fornitore di hosting e distribuzione dell&apos;applicazione;</li>
        <li>fornitore di base di dati e archiviazione documentale in cloud;</li>
        <li>portali immobiliari, limitatamente ai dati dell&apos;immobile pubblicato;</li>
        <li>
          consulenti, professionisti e autorità pubbliche quando previsto da un obbligo di
          legge.
        </li>
      </ul>
      <p>
        L&apos;elenco aggiornato dei responsabili del trattamento può essere richiesto
        scrivendo a {valorParaMostrar(datos, 'emailPrivacidad')}.
      </p>

      <h2>6. Trasferimenti fuori dallo Spazio Economico Europeo</h2>
      <p>
        Alcuni fornitori possono trattare i dati al di fuori dello SEE. In tal caso il
        trasferimento avviene sulla base di una decisione di adeguatezza della Commissione
        europea oppure delle Clausole Contrattuali Tipo (art. 46 GDPR), unitamente alle
        misure supplementari eventualmente necessarie.
      </p>

      <h2>7. Periodo di conservazione</h2>
      <ul>
        <li>
          <strong>Dati contrattuali e documenti sottoscritti:</strong> per la durata del
          rapporto e successivamente per il termine previsto dalla normativa civilistica e
          fiscale applicabile.
        </li>
        <li>
          <strong>Dati di clienti senza rapporto contrattuale in corso:</strong> per il tempo
          necessario a dare seguito alla richiesta e, successivamente, fino a revoca del
          consenso o opposizione dell&apos;interessato.
        </li>
        <li>
          <strong>Registri di attività:</strong> 365 giorni, con cancellazione automatica.
        </li>
        <li>
          <strong>Schede eliminate dal CRM:</strong> l&apos;eliminazione è differita per
          consentire il ripristino in caso di errore; trascorso tale intervallo i dati
          vengono rimossi definitivamente. I <strong>documenti firmati non vengono
          eliminati automaticamente</strong>, in quanto costituiscono documentazione
          dell&apos;attività svolta.
        </li>
      </ul>
      <p className="text-slate-500">
        <em>
          I termini puntuali di conservazione vanno verificati dall&apos;Agenzia in base agli
          obblighi di legge applicabili e ai contratti in essere.
        </em>
      </p>

      <h2>8. Diritti dell&apos;interessato</h2>
      <p>
        Ai sensi degli articoli da 15 a 22 del GDPR, l&apos;interessato ha diritto di
        ottenere:
      </p>
      <ul>
        <li>l&apos;<strong>accesso</strong> ai propri dati personali;</li>
        <li>la <strong>rettifica</strong> dei dati inesatti o incompleti;</li>
        <li>la <strong>cancellazione</strong> dei dati, nei casi previsti;</li>
        <li>la <strong>limitazione</strong> del trattamento;</li>
        <li>la <strong>portabilità</strong> dei dati in formato strutturato;</li>
        <li>
          l&apos;<strong>opposizione</strong> al trattamento fondato sul legittimo interesse;
        </li>
        <li>
          la <strong>revoca del consenso</strong> in qualsiasi momento, senza pregiudicare la
          liceità del trattamento effettuato prima della revoca.
        </li>
      </ul>
      <p>
        Le richieste vanno inviate a <strong>{valorParaMostrar(datos, 'emailPrivacidad')}</strong>. L&apos;Agenzia
        risponde entro un mese, prorogabile di due mesi in caso di particolare complessità.
      </p>
      <p>
        L&apos;interessato ha inoltre diritto di proporre <strong>reclamo</strong> al Garante
        per la protezione dei dati personali (
        <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">
          garanteprivacy.it
        </a>
        ) o all&apos;autorità di controllo dello Stato in cui risiede.
      </p>

      <h2>9. Decisioni automatizzate</h2>
      <p>
        Il CRM calcola un punteggio di compatibilità tra le preferenze dichiarate dal cliente
        e gli immobili disponibili, al solo fine di <strong>ordinare</strong> le proposte da
        sottoporre all&apos;operatore. Tale elaborazione{' '}
        <strong>non produce effetti giuridici</strong> né incide significativamente
        sull&apos;interessato: ogni proposta è valutata e selezionata da una persona.
      </p>

      <h2>10. Misure di sicurezza</h2>
      <p>
        L&apos;accesso al CRM è riservato ai collaboratori autorizzati, con credenziali
        personali e profili di autorizzazione differenziati. Le password sono conservate
        esclusivamente in forma cifrata. I documenti riservati sono accessibili solo
        attraverso il sistema autenticato. Le operazioni critiche sono registrate.
      </p>

      <h2>11. Modifiche</h2>
      <p>
        La presente informativa può essere aggiornata. La versione vigente è sempre
        disponibile a questo indirizzo, con indicazione della data di ultimo aggiornamento.
      </p>
    </PaginaLegale>
  );
}
