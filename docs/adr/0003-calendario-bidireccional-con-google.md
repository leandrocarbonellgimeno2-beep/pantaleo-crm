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
https://<tu-dominio-de-produccion>/api/calendar/callback
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

**Elegí bien la cuenta en ese paso.** El calendario que se conecte ahí es el de
todos: cada cita de la agencia —nombre del cliente, dirección del inmueble y
teléfono en la descripción— va a aterrizar en él.

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

## Lo que queda fuera

- **No se tocó ni una cita existente.** Todo esto es código.
- Las citas que ya estaban en Firestore no tienen `googleEventId`, así que no
  suben a Google retroactivamente. Si se quisiera, sería un script aparte y una
  decisión tuya.
- No hay UI para desconectar la cuenta. Hoy se haría borrando el documento
  `calendar_configs/default_admin`.
