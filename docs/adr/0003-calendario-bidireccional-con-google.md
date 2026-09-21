# ADR 0003 — Calendario bidireccional con Google

- **Fecha**: 2026-09-21
- **Estado**: implementado en código; **falta la conexión OAuth, que solo puede
  hacer una persona** (ver «Lo que tenés que hacer vos»)

---

## Qué se quería

Un único calendario de Google para toda la agencia. Francesco conecta su cuenta
una vez y ese calendario es el de todos. Lo agendado en el CRM sube a Google, y
lo creado en Google —incluido lo que Francesco apunta desde el móvil— baja al
CRM.

## De dónde se partía

- La sincronización era **de una sola dirección** (Google → CRM) y estaba rota:
  `timeMax` valía siempre «ahora», así que **no podía importar ni una cita
  futura**, que es justamente lo que sirve de algo.
- Editar una cita en el CRM **no tocaba Google en absoluto**. Crear sí, borrar
  sí, editar no.
- Cada importación releía el calendario entero.
- La importación **pisaba el nombre del cliente** con el título del evento,
  porque no distinguía los eventos que había creado el propio CRM.
- El enlace con Google **lleva caducado desde el 20 de marzo** y nada lo decía:
  la pantalla afirmaba «Sincronizzazione automatica attiva» mirando solo si
  existía una cadena guardada.

---

## Decisiones

### 1. El token es de la agencia, no de quien pulsa «Conectar»

Vive en `calendar_configs/default_admin`. El id del documento es una
**constante de servidor** (`src/lib/calendar-config.ts`), no algo derivado de
la sesión. Vincular exige rol **propietario**.

**Por qué no se movió a `_integrations` como pedía el encargo.** Ese documento
es el que está vivo en producción y guarda el `refresh_token`. Cambiarlo de
sitio lo dejaría huérfano y obligaría a volver a autorizar a mano: es una
migración de datos encubierta, y en este proyecto eso no se hace en silencio.
El documento ya cumple lo que importaba —**es de la agencia y no de un
usuario**—; lo que cambia es el nombre, no la propiedad.

### 2. El anti-rebote: marca + marca de tiempo

Con sincronización en los dos sentidos hay un bucle esperando: el CRM crea un
evento → la sincronización lo lee → crea una cita → que sube otro evento → …

Cada evento que el CRM crea lleva:

```
extendedProperties.private = { origin: 'CRM', crmAppointmentId: '<id de la cita>' }
```

Y cada cita guarda `googleSyncedAt`: cuándo la subimos por última vez.

Al importar, un evento con `origin=CRM` se ignora **solo si Google lo tocó
dentro de los 60 segundos siguientes** a nuestra última subida. Si lo tocaron
más tarde, es una edición hecha de verdad en Google y **sí baja**.

Una regla más simple —«ignora siempre lo que lleve `origin=CRM`»— habría
cortado el bucle igual, pero se habría comido justo lo que Francesco va a
hacer: abrir la cita en el móvil y moverla de hora.

Los 60 segundos no son un número redondo: entre que mandamos el evento y Google
sella su `updated` pasan milisegundos, y los relojes no son el mismo. Sin
margen, nuestro propio eco parecería una edición ajena y volvería a bajar; con
un margen grande, una edición real justo después se perdería.

### 3. Incremental con `syncToken`, disparado por cron

Google devuelve un `nextSyncToken`; en la vuelta siguiente solo manda lo que
cambió, borrados incluidos. El cron corre **cada 15 minutos**.

**Por qué cron y no webhooks.** Los avisos push de Google Calendar exigen
verificar el dominio en Search Console. Sin eso, Google rechaza el canal y la
sincronización no se entera de nada. El cron no depende de nada externo.

Dos detalles que condicionan el código:

- Con `syncToken`, Google **rechaza** `timeMin`, `timeMax`, `orderBy` y `q`. La
  ventana se fija en la sincronización completa inicial y se hereda. Por eso la
  completa va de **un año atrás en adelante, sin tope superior**: así las citas
  futuras entran.
- Si el token caduca, Google responde **410 GONE**. Eso no es un error que
  enseñar a nadie: es «empieza otra vez», y el código rehace la completa solo.

El token **solo se guarda si la vuelta terminó entera**. Guardarlo tras un
fallo a medias daría por vistos cambios que nunca se aplicaron, y esos eventos
no volverían a aparecer jamás.

### 4. Los huérfanos entran, y no se les inventa nada

Un evento creado en el móvil no tiene cliente ni inmueble del CRM, y no los va
a tener. Se guarda con `source: 'google_calendar'` y el título del evento como
`clientName`, que es lo que la agenda ya pinta.

**No se busca al cliente por nombre.** Una coincidencia equivocada ataría una
cita al cliente que no es, y la agenda solo necesita título y hora para
bloquear el hueco.

### 5. Un borrado en Google no destruye la cita

Se marca `status: 'Annullato'`. Borrarla dejaría al agente sin saber que
aquello existió, y el borrado en Google puede haber sido un error de quien lo
hizo.

### 6. El CRM no canta éxito si Google falló

Crear, editar y borrar devuelven `sincronizzatoConGoogle`. La cita **sí** se
guarda en el CRM aunque Google falle —tirar el trabajo del agente porque un
servicio externo no responde sería peor—, pero la pantalla lo dice en vez de
pintar un tic verde.

Y si Google **rechaza las credenciales**, «Il mio lavoro» pinta un aviso rojo
con un botón para reconectar. Solo ante un rechazo de credenciales, no ante un
fallo de red pasajero: un aviso que salta solo se deja de mirar.

---

## Lo que tenés que hacer vos, Leandro

El flujo de OAuth **no lo puede hacer un programa**: hay que aceptar la
pantalla de consentimiento de Google con una cuenta real. Estos son los pasos
exactos.

### Paso 0 — Comprobar qué credenciales ya existen

El código espera tres variables de entorno:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

Si el CRM ya tuvo el calendario funcionando (lo tuvo, hasta el 20 de marzo),
**las credenciales ya existen** y no hace falta crear nada nuevo: lo que caducó
es el `refresh_token`, no el cliente OAuth. Miralo en Vercel →
Settings → Environment Variables.

**Si no estuvieran**, hay que crearlas: Google Cloud Console → el proyecto →
*APIs & Services* → *Credentials* → *Create Credentials* → *OAuth client ID* →
tipo **Web application**.

### Paso 1 — La API tiene que estar activada

Google Cloud Console → *APIs & Services* → *Library* → **Google Calendar API** →
*Enable*. Si ya funcionaba, ya está.

### Paso 2 — El redirect URI

En Google Cloud Console → *Credentials* → el cliente OAuth → **Authorized
redirect URIs**, tiene que estar exactamente:

```
https://sistema-immobiliare-pantaleo.vercel.app/api/calendar/callback
```

Y si querés probarlo en local, además:

```
http://localhost:3000/api/calendar/callback
```

**Tiene que coincidir carácter por carácter**, incluido el `https` y sin barra
final. Google rechaza el intercambio si difiere en un solo carácter.

Ojo con un detalle: `/api/calendar/auth` y `/api/calendar/callback` derivan el
redirect URI del dominio por el que entra la petición, mientras que el refresco
del token usa `GOOGLE_REDIRECT_URI`. **Los tres tienen que apuntar al mismo
sitio.** Si `GOOGLE_REDIRECT_URI` en Vercel no coincide con el dominio real, la
conexión se hace bien y luego el refresco falla a las pocas horas.

### Paso 3 — La pantalla de consentimiento

Google Cloud Console → *APIs & Services* → *OAuth consent screen*.

Google pide dos enlaces obligatorios para publicar la app. **Ya existen y son
públicos** (se abren sin iniciar sesión):

```
https://sistema-immobiliare-pantaleo.vercel.app/privacy
https://sistema-immobiliare-pantaleo.vercel.app/terms
```

⚠️ **Antes de pegarlos ahí, completá los datos de la agencia** en
`src/lib/datos-titular.ts`: razón social, dirección, P. IVA, correos y
teléfono. Mientras queden marcadores, las dos páginas muestran un aviso de
«documento da completare» — y Google revisa esas páginas a mano.

La política de privacidad ya declara **qué datos de Google se usan y para
qué** (calendario y correo de la cuenta), que es justo lo que mira el revisor
de Google.

- **User type**: si la cuenta de Francesco es de Google Workspace del mismo
  dominio del proyecto, elegí **Internal** y te ahorrás la verificación. Si es
  una cuenta `@gmail.com` normal, tiene que ser **External**.
- Con **External** y la app en modo *Testing*, hay que añadir la cuenta de
  Francesco en **Test users**. En ese modo el `refresh_token` **caduca a los 7
  días** — es muy probablemente lo que pasó el 20 de marzo.
- Para que el token no caduque, la app tiene que estar **publicada** (*Publish
  app*). Con los scopes de abajo, Google **puede pedir verificación**; para uso
  interno de una agencia suele bastar con publicar y aceptar el aviso de «app
  no verificada», pero **eso es una decisión tuya** y conviene preverlo.

**No hace falta verificar el dominio en Search Console** con este diseño: eso
solo lo exigen los webhooks push, y aquí se usa un cron precisamente para no
depender de ello.

### Paso 4 — Los scopes

Los pide el código, no hay que configurarlos a mano, pero son los que aparecen
en la pantalla de consentimiento:

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.email
```

El primero da lectura y escritura del calendario (hace falta: el CRM crea,
edita y borra eventos). El segundo solo sirve para guardar con qué cuenta se
conectó y enseñarlo.

### Paso 5 — Conectar, ya dentro del CRM

1. Entrá al CRM **con un usuario de rol `propietario`**. Vincular la cuenta de
   la agencia exige ese rol: cualquier otro recibe 403.
2. Andá a **Agenda**. Si no hay conexión, sale el botón de conectar. (También
   sale el aviso rojo en «Il mio lavoro», con el botón *Ricollega Google*.)
3. Pulsalo, elegí **la cuenta de Google de la agencia** —no una personal— y
   aceptá.
4. Volvés al CRM con `?calendar_connected=true`.

**Elegí bien la cuenta en ese paso, y mirá dos veces el selector de Google.**
El CRM guarda los tokens de la cuenta que elijas **sin compararla con nada**:
lo único que exige es que tu usuario del CRM sea propietario. Si tenés varias
cuentas de Google abiertas en el navegador —lo normal— un clic en la
equivocada manda a tu Gmail personal cada cita de la agencia, con el nombre
del cliente, la dirección del inmueble y el teléfono en la descripción. Y la
agencia deja de recibirlas.

Después de conectar, comprobá qué cuenta quedó: sale en el aviso de «Il mio
lavoro» y en la agenda.

### ⚠️ Antes de conectar, decidí QUÉ calendario

El CRM sincroniza con el calendario **`primary`** de la cuenta que se conecte,
en los dos sentidos. Eso significa que **todo lo que haya en ese calendario se
copia a Firestore** y lo ve cualquier agente del CRM: visitas médicas, asuntos
de familia, lo que sea.

Se mitiga en parte —los eventos marcados como **privados** en Google no se
importan— pero no es lo mismo que separarlos.

**Mi recomendación: crear un calendario aparte** («Agenzia») en la cuenta de
Google y compartirlo con quien deba verlo, en vez de usar el personal. Hoy el
código usa `primary`; apuntar a otro calendario es un cambio de una línea, pero
**es una decisión tuya** y cambia lo que hay que hacer al conectar. Si preferís
seguir con `primary`, sabelo: la agenda personal de Francesco pasa a estar en
el CRM.

### Paso 6 — `CRON_SECRET`

El cron necesita `CRON_SECRET` en Vercel. Ya existe (lo usa el cron de purga).
Si no estuviera, el cron responde 401 y **no sincroniza nada en silencio**.

### Paso 7 — Comprobar que funciona

1. En Vercel → *Cron Jobs*, tiene que aparecer `/api/cron/calendar-sync` cada
   15 minutos. **Ojo: en el plan Hobby de Vercel los crons corren una vez al
   día.** Si el proyecto no está en Pro, el cron existe pero no corre cada 15
   minutos: el botón «Sincronizza» de la agenda sigue funcionando a mano.
2. Creá una cita en el CRM → tiene que aparecer en Google en segundos.
3. Cambiale la hora en el CRM → tiene que moverse en Google.
4. Creá un evento **en Google** a mano → tras la siguiente vuelta del cron (o
   pulsando «Sincronizza») tiene que salir en la agenda.
5. Movelo en Google → la cita del CRM tiene que seguirlo.
6. Borralo en Google → la cita tiene que quedar como **Annullato**, no
   desaparecer.

---

---

## Cómo se revisó esto

Es la parte con más riesgo del encargo, así que fue a una revisión adversarial
antes de darse por hecha: 6 revisores con enfoques distintos (bucle infinito,
destrucción de datos, OAuth y tokens, cron y concurrencia, huérfanos en la
interfaz, y qué se le cuenta al usuario), y 3 escépticos por hallazgo
intentando tumbarlo. **57 hallazgos en bruto, 34 sobrevivieron** — 7 críticos.

Los que más importaban, todos arreglados:

1. **El estado se escribía con claves con punto y `set(merge)`**, y Firestore
   solo parte las claves por el punto en `update`. Resultado: el `syncToken`
   **no se guardaba nunca** —cada vuelta rehacía la sincronización completa de
   doce meses— y `sync.desconectado` tampoco existía, así que **el aviso rojo
   no podía salir**. Un fallo que dejaba sin efecto medio diseño.
2. **El nombre del cliente se corrompía en cada ida y vuelta.** Al bajar una
   edición hecha en Google se escribía `clientName = summary`, y el título que
   el CRM sube es «Appuntamento CRM: <cliente>». El prefijo se acumulaba:
   «Appuntamento CRM: Appuntamento CRM: Mario Rossi». Ahora de una cita del CRM
   Google solo manda **cuándo** es.
3. **Dos vueltas a la vez duplicaban las citas.** El cron y el botón llaman a
   la misma función y el id del documento era automático. Ahora hay turno con
   transacción y el id se deriva del id del evento, así que la operación es
   idempotente.
4. **Editar una cita re-creaba el evento ante CUALQUIER fallo de Google**, no
   solo cuando ya no existía: un 403 de cuota dejaba dos eventos y el viejo
   fuera del alcance del CRM para siempre.
5. **Borrar un huérfano desde el CRM borraba el evento real de Google.** Un
   huérfano siempre tiene `googleEventId`, así que quitar de la agenda la fila
   «Comunione di mia figlia» la borraba del calendario y avisaba a los
   invitados. Ahora el CRM **solo borra en Google lo que el CRM creó**.
6. **Editar un huérfano reescribía el evento entero** —`events.update` es un
   reemplazo—: le cambiaba el título, le vaciaba la ubicación y le borraba
   invitados y recurrencia.
7. **Un evento pasado a «todo el día» destruía la hora real** de una cita del
   CRM (00:00 y 1440 minutos), y **la hora se recortaba de la cadena** en vez
   de convertirse a la zona de la agencia.

## Lo que queda fuera

- **No se tocó ni una cita existente.** Todo esto es código.
- Las citas que ya estaban en Firestore no tienen `googleEventId`, así que no
  suben a Google retroactivamente. Si se quisiera, sería un script aparte y una
  decisión tuya.
- No hay UI para desconectar la cuenta. Hoy se haría borrando el documento
  `calendar_configs/default_admin`.
- **Los eventos de día completo de varios días solo bloquean el primer día.**
  Se importan con `allDay` y `dateEnd`, así que el dato está, pero la agenda
  agrupa por `date`: unas vacaciones del 10 al 14 se ven solo el día 10. Cubrir
  el rango en la vista es un cambio aparte.
- **No se valida qué cuenta de Google se conecta.** Ver el aviso del paso 5.
  Añadir una comprobación contra una cuenta esperada es fácil, pero exige
  decidir cuál es y ponerla en Vercel: es tuyo.
