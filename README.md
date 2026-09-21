# CRM Immobiliare Pantaleo — documento de traspaso

Sistema de gestión inmobiliaria de Immobiliare Pantaleo (Marsala, TP). Gestiona
inmuebles, clientes, propietarios, documentos contractuales y agenda, y publica
anuncios en Idealista.

Este documento es para **quien reciba y mantenga el sistema**. No es un manual de
uso de la aplicación: es lo que hay que saber para operarla, desplegarla y no
romperla.

> **Cómo leer las afirmaciones de este documento.** Todo lo que aquí se dice está
> comprobado contra el código, y cada apartado cita el fichero. Lo que vive en un
> panel externo (Vercel, Firebase, GitHub, Idealista) **no se puede comprobar
> desde el repositorio**: eso va marcado como **⚠ CONFIRMAR FUERA** en vez de
> darlo por supuesto. El apartado 13 los reúne todos.

Última revisión: **21 de septiembre de 2026**.

---

## 1. Antes de dar la entrega por buena

1. **Rellenar los datos legales de la agencia.** Las páginas públicas
   `/privacy` y `/terms` se sirven hoy con los huecos sin completar: muestran
   `[Ragione sociale da completare]` y un aviso ámbar «Documento da completare».
   Se arreglan desde la aplicación, en **Amministrazione → Dati aziendali**, con
   el rol `propietario`.
2. **Entregar el fichero `.env.local` por un canal seguro.** No viaja en el
   repositorio (`.gitignore:34`) y sin él no funciona ningún script. Contiene
   **dos** cosas delicadas, no una: la clave privada del Admin SDK de Firebase
   (acceso total a la base de producción) y, dentro de `AUTH_USERS_JSON`, **las
   contraseñas del equipo en claro**. No se manda por correo ni por WhatsApp.
3. **Decidir la titularidad de las cuentas** (apartado 2) y **quién paga**
   (apartado 13).

---

## 2. Quién es dueño de qué

El repositorio solo demuestra **dónde está alojado hoy** cada servicio.

| Servicio | Dónde está hoy | Para qué |
|---|---|---|
| **GitHub** | `leandrocarbonellgimeno2-beep/pantaleo-crm` | El código. Rama principal: `master`. |
| **Vercel** | proyecto `pantaleo-crm` | Alojamiento y despliegue. ⚠ CONFIRMAR FUERA: sale de `.vercel/project.json`, un fichero local sin versionar. |
| **Firebase** | proyecto `crm-pantaleo-propio` | Base de datos (Firestore) y ficheros (Storage). Confirmado en `.firebaserc`. |
| **Idealista** | cuenta de la agencia | Publicación de anuncios. |
| **Dominio** | `sistema-immobiliare-pantaleo.vercel.app` | ⚠ CONFIRMAR FUERA: ver el aviso del apartado 5. |

**Transferir el proyecto de Vercel y el de Firebase a una cuenta de la agencia es
lo que hace que la entrega sea real.** Mientras vivan en una cuenta personal, la
agencia depende de que esa cuenta siga existiendo.

No hay fichero `LICENSE`: **la propiedad del código no está escrita en ninguna
parte**. Conviene acordarla por escrito.

---

## 3. Qué es, por dentro

- **Next.js 16.1.6** (App Router) con **React 19.2.3** y TypeScript.
- **Firebase Admin SDK** contra Firestore y Cloud Storage. Todo el acceso a datos
  pasa por el servidor: **no hay SDK de Firebase en el navegador**.
- Desplegado en **Vercel**. **Node 24** (es lo que fija el CI).

**`src/proxy.ts` es el portero de todo.** En Next 16 este fichero es lo que antes
se llamaba `middleware.ts`. Intercepta **todas** las peticiones: si no hay cookie
de sesión válida, devuelve 401 a las rutas de API y manda a `/login` a las
pantallas. Las únicas excepciones son `/api/auth/*`, `/api/cron/*`, `/login`,
`/privacy` y `/terms`. Si algo deja de responder de golpe, este fichero es el
primer sitio donde mirar.

### Levantar el proyecto en local

```bash
npm ci
npm run dev     # http://localhost:3000
```

> ### ⚠ `npm run dev` en local escribe en PRODUCCIÓN
> El `.env.local` que se entrega apunta a `crm-pantaleo-propio`, **el mismo
> proyecto Firebase que usa el sistema en producción**. No hay entorno de pruebas.
> Cualquier cosa que se borre o se modifique desarrollando en local **se borra o
> se modifica de verdad**, para toda la agencia.

### Órdenes del proyecto

```bash
npm run build          # compilación de producción
npm test               # 630 tests
npx tsc --noEmit       # comprobación de tipos
npm run deploy:indexes # despliega índices Y políticas TTL (apartado 7)
npm run lint           # ⚠ NO pasa: ver abajo
```

**Lo que sirve de red de seguridad son `npm test` y `npx tsc --noEmit`**, que van
en verde y corren en CI. `npm run lint` **no pasa**: devuelve 749 problemas (657
errores), casi todos `no-explicit-any` heredados. No está en el CI y no se puede
usar como criterio de «está bien o está mal».

Los tests son **630 en 42 ficheros**, todos unitarios o de contrato sobre el
código fuente. **No hay ninguna prueba de extremo a extremo funcionando**: existe
`tests/e2e/smoke.spec.ts`, que parece cubrirlo, pero **vitest nunca lo ejecuta**
(`vitest.config.ts:9` solo incluye `tests/unit/**`). Antes de entregar o tras un
cambio grande, hay que **probar a mano** en el navegador.

---

## 4. Cómo se despliega

**En cada `git push` a `master`, Vercel construye y publica solo.**
⚠ CONFIRMAR FUERA: esa conexión vive en Vercel (Settings → Git).

En `.github/workflows/`:

- **`ci.yml`** — en cada push: `npm ci`, tipos, tests y compilación (con Node 24).
  Si `npm ci` falla, los tres pasos siguientes se saltan. Genera una clave RSA de
  usar y tirar con `openssl` en el runner, en vez de guardar una clave real.
  **CI no puede bloquear un despliegue**: Vercel despliega en paralelo, por su
  cuenta. Un CI en rojo **no impide** que el código llegue a producción.
- **`deploy.yml`** — despliegue **manual**, desde la pestaña Actions («Run
  workflow»). Llama al Deploy Hook de Vercel; necesita el secreto
  `VERCEL_DEPLOY_HOOK_URL`. Sirve sobre todo **después de cambiar una variable de
  entorno en Vercel, que por sí sola no redespliega nada**. ⚠ CONFIRMAR FUERA: a
  qué rama apunta el hook lo decide Vercel al crearlo, no el repositorio.

  Hasta el 21/09/2026 corría **solo, cada 4 horas**. Se retiró: se justificaba
  diciendo que refrescaba `/api/get-all-rifs`, que hoy es `force-dynamic`.
  Reconstruía código idéntico seis veces al día para nada.

**Deshacer un despliegue malo:** en el panel de Vercel, pestaña Deployments,
abrir el despliegue anterior que funcionaba y usar **Promote to Production**.
Es lo único que devuelve el servicio en un minuto. Revertir el commit y esperar a
que reconstruya tarda varios minutos más.

**Dónde se miran los registros:** todos los `console.error` y `console.warn` del
servidor **solo se ven en Vercel**, en el proyecto → pestaña **Logs**. No hay
ninguna pantalla del CRM que los muestre. Varios avisos importantes de este
documento solo aparecen ahí.

---

## 5. Variables de entorno

### Obligatorias

| Variable | Qué pasa si falta |
|---|---|
| `FIREBASE_PROJECT_ID` | **Nada arranca.** `src/lib/firebase-admin.ts:9-11` lanza al cargarse el módulo. Sin fallback. |
| `FIREBASE_CLIENT_EMAIL` | Igual. |
| `FIREBASE_PRIVATE_KEY` | Igual. Se guarda **en una sola línea**, con los saltos escritos como la secuencia literal `\n`. Una clave con saltos reales se trunca. |
| `SESSION_SECRET` | **Nadie entra y nadie sigue dentro.** Cambiar su valor **echa a todo el equipo a la vez**: es un martillo, no la forma de echar a una persona (apartado 8). |
| `CRON_SECRET` | La papelera deja de vaciarse **en silencio**: el cron responde 401. No hay ningún aviso en la aplicación; solo en los registros de Vercel. Es deliberado: sin esa variable, `Bearer undefined` sería credencial válida. |

### Para que funcione Idealista

| Variable | Nota |
|---|---|
| `IDEALISTA_CLIENT_SECRET` | Sin ella, toda operación contra Idealista lanza. |
| `IDEALISTA_CLIENT_ID` | Tiene valor por defecto en el código (`immobiliarepantaleo`), que no es secreto. |
| `IDEALISTA_FEED_KEY` | Cabecera en cada llamada. Si falta, se manda **vacía, sin aviso**. |
| `IDEALISTA_USE_SANDBOX` | **Solo el valor literal `'true'` activa el entorno de pruebas.** Cualquier otro valor, o su ausencia, apunta al **portal real**. |

### Opcionales

| Variable | Nota |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Dirección pública del CRM. **Manda sobre el valor escrito en el código.** Ver aviso abajo. |
| `FIREBASE_STORAGE_BUCKET` | Si falta, el nombre se deduce del `PROJECT_ID`. El peligro no es que falte: es que esté **mal puesta**. El valor correcto es **`crm-pantaleo-propio.firebasestorage.app`**. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sin ellas **no se reporta ningún error** (apartado 12). |

> ### ⚠ Aviso sobre el dominio
> `urlDelSitio()` (`src/lib/site-url.ts:38-45`) lee primero `NEXT_PUBLIC_APP_URL`,
> luego `NEXT_PUBLIC_SITE_URL`, y **solo si las dos están vacías** usa el dominio
> escrito en el código.
>
> En la copia local, `NEXT_PUBLIC_APP_URL` apunta al dominio **viejo**
> (`pantaleo-crm.vercel.app`). **⚠ CONFIRMAR FUERA (Vercel → Environment
> Variables):** si en producción está ese valor, los enlaces que se mandan a los
> clientes por WhatsApp apuntan hoy al dominio viejo. Hay un test que vigila el
> código fuente, pero **no puede ver lo que está puesto en Vercel**.

> ### ⚠ El bucket del `.env.local` está mal
> El valor que trae la copia local **apunta a un bucket que no existe**. El
> sistema no se cae porque todos los sitios que lo usan deducen el nombre solos,
> pero conviene corregirlo. Quedó anotado en el informe de ejecución del
> 21/09/2026: «el de `FIREBASE_STORAGE_BUCKET` no existe; se usa este».

### Legado: presentes pero que no lee nadie

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (restos de la
integración con Google Calendar, ya eliminada), `GEMINI_API_KEY`, `DATABASE_URL`,
`DIRECT_URL`, las tres de Supabase, `NX_DAEMON` y cuatro `TURBO_*`.

Son **14 claves que ninguna línea lee**. Conviene borrarlas también de Vercel:
varias son credenciales vivas de servicios que este sistema no usa.

---

## 6. La única dependencia externa: Idealista

**Todo lo de Idealista exige el rol `secretaria`.** Un `vendedor` no puede
publicar, actualizar, despublicar ni reactivar: no le aparece la opción.

- **Autenticación** (`src/lib/idealista-auth.ts`): OAuth. El token se pide solo y
  se guarda en memoria de cada instancia mientras vale. No hay nada que renovar a
  mano — y tampoco forma de forzar su renovación salvo redesplegar.
- **Reintentos**: hasta 3 intentos, con esperas de 500 ms y 1.500 ms. Un `POST`
  **no se reintenta ante un 5xx ni ante un error de red** — eso era lo que
  duplicaba anuncios y contactos —, pero **sí se reintenta ante un 429**, porque
  un rate limit significa que el portal rechazó la petición sin procesarla. Con
  cabecera `Retry-After`, se espera lo que diga el portal, hasta 10 segundos.
- **Dónde se ven los fallos**, que no es un solo sitio:
  - Los rechazos de **publicar** y **actualizar** se guardan en el propio
    inmueble, en `Idealista.idealistaError`. **Ningún otro fallo se guarda** — y
    entre los que no se guardan está el de creación de contacto.
  - Los fallos por excepción (red, OAuth) hacen `console.error` **y además**
    devuelven el mensaje en la respuesta, que la interfaz enseña como aviso
    emergente. No se pierden.
  - El texto del error **guardado** no se enseña en ninguna pantalla.
- **Cómo se ve el estado**: en la ficha del inmueble, por un punto de color y por
  qué botón aparece — «Pubblica», «Aggiorna» o «Riattiva su Idealista». Hay
  además un botón de **despublicación manual**.
- **Probar sin publicar de verdad**: existen `/api/idealista/dry-run` y
  `scripts/dry-run-idealista.mjs`, que enseñan el payload exacto que se enviaría
  **sin mandar nada** al portal. Es la primera herramienta que usar ante una
  incidencia.

> ### ⚠ Tres cosas que hay que saber antes de usarlo en serio
>
> 1. **Publicar un inmueble no envía las fotos.** El envío de fotos vive en una
>    ruta propia (`/api/idealista/images`) que **ningún botón llama**. El anuncio
>    sale con los datos y sin imágenes.
> 2. **El contacto se crea antes de validar la dirección.** Si al inmueble le
>    falta dirección, ciudad o código postal, la publicación se aborta — pero para
>    entonces ya puede haber creado un contacto en Idealista.
> 3. **Si Idealista falla, el inmueble borrado no se borra nunca.** Ver el
>    apartado 7 y el runbook del 11.

---

## 7. Los datos

**Firestore.** De negocio: `immobili`, `clienti`, `proprietari`, `appointments`,
`documenti_generati`, `documenti_template`, `counters`. De infraestructura:
`_users`, `_audit_logs`, `_presence`, `_rate_limits`, `_config`.

### Borrar: no hay papelera

Borrar un inmueble, un cliente, un propietario o un documento generado **no borra
de inmediato**: marca el documento como `pendente_cancellazione`, y a partir de
ese momento **desaparece de todas las pantallas**.

> **No existe ninguna papelera ni forma de deshacer desde el CRM.** Nada en la
> aplicación devuelve un registro marcado a la vida: no hay botón, ni pantalla, ni
> ruta de API. Los 30 minutos siguientes **no son una papelera**, son solo el
> tiempo que tarda el borrado físico. Recuperar algo en esa ventana exige entrar
> en la consola de Firebase y quitar a mano los campos `_status` y `_deletedAt`
> del documento. Pasados los 30 minutos, ya no hay nada que recuperar.
>
> **Al usuario hay que decirle que borrar es definitivo**, porque en la práctica
> lo es.

Un cron diario a las **00:00 UTC** (`vercel.json`) hace el borrado físico de lo
marcado hace más de 30 minutos. **Tres salvedades que importan:**

1. **Un inmueble con anuncio en Idealista solo se borra si el portal consigue
   despublicarlo.** Si falla, el cron **salta ese inmueble entero** —ni documento
   ni fotos— y lo reintenta cada noche. Mientras Idealista siga fallando, ese
   inmueble **no se borra nunca**: no se ve en el CRM, pero sus datos y sus fotos
   siguen ahí. Es deliberado: al borrar el documento se perdería el identificador
   del anuncio y quedaría vivo para siempre, sin forma de bajarlo.
2. **Solo en los inmuebles se borran también los ficheros del bucket**, y solo las
   fotos. En propietarios y clientes el cron borra el documento y **deja sus
   ficheros huérfanos** en Storage (documentos de identidad, planimetrías).
3. **`documenti_generati` está excluida del cron.** Un documento generado que se
   borra queda marcado **para siempre**: invisible en el CRM, presente en la base.

### Copia de seguridad

`/api/backup-db` descarga un JSON con **`immobili`, `proprietari` y `clienti`, y
nada más**. No incluye citas, documentos, documentos generados, usuarios ni
**ningún fichero del bucket**. Limitada a 3 descargas cada 10 minutos.

> **Tres límites que hay que tener claros:**
> - **No se restaura.** No existe ninguna ruta de importación ni ningún script de
>   restauración en todo el repositorio. Ese JSON sirve para consultar qué había,
>   no para devolver el sistema a un estado anterior. Recuperar de verdad exigiría
>   escribir la importación o hacerlo a mano.
> - **Nadie la hace sola.** No está programada: hay que lanzarla a mano
>   escribiendo la dirección en el navegador. Si nadie la lanza, no hay copias.
> - **Lleva datos personales en claro, y firmas manuscritas**, tanto de
>   propietarios como de clientes: van dentro del documento como imagen. También
>   incluye los registros ya marcados para borrar. Trátalo como documento
>   confidencial.

### Ficheros (Cloud Storage)

- **Públicas:** las fotos de inmuebles — **4.738 ficheros**, con enlace directo,
  sin caducidad y sin sesión. Es obligatorio: Idealista tiene que poder
  descargarlas.
- **Privados:** todo lo demás. Se sirven por `/api/files`, que exige sesión.

  El 21/09/2026 se revocaron los enlaces públicos de los **320 PDF** de
  `documenti_generati/`. **Es irreversible**: cualquier enlace a un folio firmado
  compartido por fuera del CRM dejó de funcionar. Dentro del CRM no cambia nada.

### Reglas y TTL

`firestore.rules` está en **denegar todo**, que es lo correcto: todo pasa por el
servidor con el Admin SDK, que se salta las reglas por diseño.

`storage.rules` **también está en denegar todo, pero eso no cuenta toda la
verdad**: los 4.738 ficheros públicos se sirven por URL con token, que es el
mecanismo de «cualquiera con el enlace» de Firebase y **no pasa por las reglas**.
Las reglas cierran una puerta que nadie usa; la que está abierta la abren los
tokens, a propósito.

⚠ **CONFIRMAR FUERA:** `firebase deploy` aparece **una sola vez** en el
repositorio, en `npm run deploy:indexes`. Esa orden sube los **índices y las
políticas TTL** (viajan juntas en `firestore.indexes.json` como `fieldOverrides`).
Lo que **no sube nadie** son las reglas: `firestore.rules` y `storage.rules` no
las despliega ninguna orden del proyecto, así que **nada garantiza que estén
desplegadas**. Hay que mirarlo en la consola de Firebase.

**TTL.** `_audit_logs` se guarda **un año** y `_rate_limits` unas horas; las dos
crecen solas y dependen de que el TTL esté activo. (`_presence` **no crece**: hay
un documento por usuario y se sobrescribe.) Declarar la política no es tenerla
activa: o se comprueba en la consola de Firebase, o se lanza
`npm run deploy:indexes`, que la activa. **Ojo: activarla no es un trámite** — en
cuanto se activa, Firestore empieza a borrar lo que ya haya caducado, incluidas
entradas de auditoría de más de un año.

---

## 8. Quién entra y con qué permisos

| Rol | Nivel | Puede |
|---|---|---|
| `propietario` | 4 | Todo, incluida la administración de usuarios. |
| `secretaria` | 3 | Lo de vendedor, más borrar, exportar y **todo lo de Idealista**. |
| `vendedor` | 2 | Crear y modificar el día a día. **No publica en Idealista.** |
| `agente` | 1 | **Solo lectura.** |

> ⚠ **Dos trampas con los nombres.**
> - `agente` es el permiso **más bajo**, de solo lectura. Al comercial que vende
>   hay que darle **`vendedor`**.
> - Si a alguien se le pone un rol **mal escrito o inventado**, el sistema no lo
>   degrada al mínimo: lo trata como **`vendedor`**, que escribe
>   (`src/lib/roles.ts:43`). Un error de dedo da permisos, no los quita.

**Dar de alta a alguien:** Amministrazione → Utenti, solo con rol `propietario`.
**No hay recuperación de contraseña**: `/api/account/password` exige la actual, y
reponérsela a otra persona solo se puede desde esa misma pantalla.

**La sesión dura 8 horas** — pero solo para los tokens firmados **después del
19/09/2026**. Los emitidos antes llevan dentro su propia caducidad de 7 días y
siguen valiendo hasta agotarla. No hay renovación ni «recordarme».

**Bloquear a alguien:** Amministrazione → Utenti, botón Disattiva. Lo que manda en
cada petición es el permiso que dice la base de datos **ahora**, no el que lleva
la sesión: por eso el bloqueo no espera a las 8 horas.

> **Pero no es instantáneo.** Hay una caché de 30 segundos, y es memoria de cada
> instancia del servidor. Al pulsar Disattiva el cambio es inmediato en la
> instancia que atendió esa petición —la que ve el administrador—, y en las demás
> tarda hasta 30 segundos. Como la siguiente petición de la persona bloqueada
> puede caer en cualquiera, **hay que contar 30 segundos desde que se guarda**, no
> darlo por hecho porque el botón respondiera al momento.
>
> Dos operaciones **no** consultan el estado y siguen funcionando para un usuario
> ya bloqueado: **cambiar su propia contraseña** y **el latido de presencia** (que
> lo sigue enseñando «en línea»). Es inocuo — el login le rechaza igual — pero
> conviene no asustarse al verlo.
>
> **No existe forma de cerrar la sesión de otra persona.** Lo único inmediato y
> total es cambiar `SESSION_SECRET`, que echa a todo el equipo.

> ### ⚠ `AUTH_USERS_JSON`: la tarea pendiente más importante
> Mientras esa variable exista en Vercel, **quien entre por ella recibe el rol
> máximo** (`propietario`), diga lo que diga la lista. Y en ese primer acceso **se
> le crea la ficha en `_users` con ese rol grabado**: borrar la variable después
> **no corrige los roles ya escritos**. Está explicado sin rodeos en
> `src/app/api/auth/login/route.ts:11-29`.
>
> El orden correcto para retirarla: (1) comprobar en Amministrazione → Utenti que
> **todo el equipo** tiene ficha y **el rol que le toca**, corrigiendo los que
> hayan quedado como `propietario`; (2) recién entonces borrar la variable en
> Vercel; (3) redesplegar. Hacerlo al revés deja a gente fuera del CRM.

**El login limita a 7 intentos cada 15 minutos por dirección IP.** Toda la oficina
sale por la misma IP: si alguien falla la contraseña siete veces, **bloquea a todo
el mundo** durante 15 minutos. Se pasa solo esperando.

Un test recorre los 34 ficheros de ruta de la API y **falla si algún manejador se
queda sin comprobación de permisos**, con seis excepciones justificadas por
escrito (`tests/unit/censo-guards.test.ts`).

**La interfaz apenas filtra por rol.** Salvo la pestaña Amministrazione, los
botones se pintan para todos: quien no tenga permiso los ve y recibe un error al
pulsarlos. La barrera de verdad está en el servidor, no en la pantalla.

---

## 9. Mantenimiento

### Scripts

Se lanzan desde la raíz del proyecto:

```bash
node scripts/<nombre>.cjs
```

Todos leen el `.env.local` y actúan **como administrador absoluto de producción**:
los roles del CRM no se aplican ahí, y **no hay entorno de pruebas**.

> **Regla de oro: lanzarlos SIEMPRE primero sin bandera** (modo simulacro), leer
> el informe, y solo entonces repetir con la bandera. Cada uno usa una palabra
> distinta: `--ejecutar`, `--force`, `--apply`.

| Script | Qué hace |
|---|---|
| `revocar-tokens-publicos.cjs` | Quita el enlace público de los ficheros privados. **IRREVERSIBLE.** Ya ejecutado el 21/09/2026 sobre 320 PDF. |
| `reparar-vinculos-propietarios.cjs` | Reconstruye el vínculo propietario↔inmuebles. Ya ejecutado (17 registros). Tiene una segunda bandera, `--incluir-desincronizados`, que **no** se usó: quedan 4 registros a medias, a propósito. |
| `backfill-sospeso.cjs` | Rellena un campo que faltaba en documentos antiguos. |
| `auditar-filtros.cjs`, `verificar-sospeso.cjs`, `inspeccionar-coleccion.cjs`, `dry-run-idealista.mjs` | Solo lectura. |

`scripts/volcados/` guarda los informes de cada ejecución. **Contiene datos reales
en claro**: no va al repositorio, pero se queda en el ordenador donde se lancen.

### Herramientas sin botón

Se abren escribiendo la dirección en el navegador, con la sesión ya iniciada.

| Dirección | Para qué | Rol |
|---|---|---|
| `/api/backup-db` | Copia de seguridad (límites en el apartado 7) | propietario |
| `/api/admin/diagnostic-proprietari` | Diagnóstico de vínculos propietario↔inmueble | propietario |
| `/api/idealista/dry-run?codice=XXXX` | Ver qué se enviaría a Idealista, sin enviarlo | secretaria |
| `/api/export-rifs` | Exporta las referencias | secretaria |
| `/api/export-no-fotos` | Lista inmuebles sin fotos | secretaria |
| `/api/get-all-rifs` | Todas las referencias | agente |

---

## 10. Decisiones de diseño que NO hay que «arreglar»

- **El limitador de peticiones, la lectura de permisos y la búsqueda de usuario en
  el login fallan hacia «dejar pasar»** cuando Firestore no responde. Es
  deliberado: un problema de infraestructura no debe dejar a la agencia sin
  trabajar. La contrapartida: durante esos segundos un bloqueo puede no aplicarse.
  **Los tres a la vez**, conviene saberlo.
- **Las fotos de inmuebles son públicas y los documentos no.** Separarlas es el
  motivo de que exista `src/lib/storage-urls.ts`. Hacerlas privadas deja el
  escaparate de Idealista en blanco.
- **La purga se salta los inmuebles que Idealista no consigue despublicar**
  (apartado 7). Es lo correcto: borrar antes dejaría el anuncio vivo para siempre.
- **`/privacy` y `/terms` se sirven sin sesión** porque son el texto legal al que
  se remite a clientes y propietarios, que no tienen acceso al CRM.
- **La CSP permite estilos y scripts en línea** porque el App Router los emite
  así. Está anotado como deuda, no como olvido.
- **El listado de inmuebles no usa paginación por cursor**: ver `docs/adr/0001`.

---

## 11. Runbook: qué hacer cuando

**Idealista deja de publicar.**
1. Abrir `/api/idealista/dry-run?codice=<RIF>`: si el payload sale bien, el
   problema es de credenciales o del portal, no de los datos.
2. Mirar los registros en Vercel → Logs.
3. Comprobar `IDEALISTA_CLIENT_SECRET` y `IDEALISTA_FEED_KEY` en Vercel, y que
   `IDEALISTA_USE_SANDBOX` **no** esté en `'true'`.
4. Tras cambiar una variable, **redesplegar** (apartado 4): si no, sigue el token
   viejo en memoria.

**Un inmueble borrado no desaparece de la base.**
Es el caso del apartado 7: Idealista no consigue despublicarlo. Se arregla solo en
cuanto las credenciales vuelvan a funcionar — el cron lo reintenta cada noche.
Despublicar a mano desde el panel de Idealista **no basta**: el CRM no se entera.
La única alternativa es editar el documento en Firestore.

**Hay que recuperar algo borrado.**
Solo dentro de los 30 minutos y solo desde la consola de Firebase, quitando
`_status` y `_deletedAt`. Pasado ese rato, no hay recuperación.

**Toda la oficina no puede entrar.**
Lo más probable: siete intentos fallidos desde la IP común (apartado 8). Se pasa
esperando 15 minutos. Si no es eso, mirar que `SESSION_SECRET` no haya cambiado.

**El despliegue falla o algo se rompió en producción.**
Vercel → Deployments → el último que funcionaba → **Promote to Production**.

**El cron de purga dejó de vaciar.**
No avisa. Comprobar `CRON_SECRET` en Vercel y la tarea en el panel. GitHub y
Vercel desactivan tareas programadas tras periodos de inactividad.

---

## 12. Lo que está a medias

| Qué | Qué pasa de verdad |
|---|---|
| **Sentry** | Instalado, pero se activa solo con el DSN. ⚠ CONFIRMAR FUERA: si no está en Vercel, **no se reporta ningún error**. |
| **Agenda** | Se pueden crear citas y verlas. **No hay forma de editarlas ni anularlas.** La colección está hoy vacía. |
| **Fotos en Idealista** | No se envían (apartado 6). |
| **«Archivio Modelli»** | Funciona, pero no hay ninguna plantilla cargada. |
| **WhatsApp de propuesta** | El mensaje **no incluye el enlace al inmueble**: se calcula y no se usa. Es así desde el primer día. |
| **Candado de borrado de clientes** | El aviso que impide borrar un cliente con documentos compara un campo que **no rellena nadie**: hoy no protege nada. |
| **Restauración de copias** | No existe (apartado 7). |
| **Pruebas de extremo a extremo** | `tests/e2e/smoke.spec.ts` existe y **nunca se ejecuta** (apartado 3). |
| **Firma obligatoria y selector de cliente** | Dos decisiones de producto pendientes: `docs/decisiones-pendientes.md`. |

---

## 13. Lo que hay que confirmar fuera del repositorio

**En Vercel:**
- [ ] Que el despliegue automático desde `master` está conectado.
- [ ] El valor real de `NEXT_PUBLIC_APP_URL` (¿dominio viejo o nuevo?).
- [ ] Corregir `FIREBASE_STORAGE_BUCKET` → `crm-pantaleo-propio.firebasestorage.app`.
- [ ] Que `CRON_SECRET` y `SESSION_SECRET` están puestas.
- [ ] Si `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` existen.
- [ ] Si `AUTH_USERS_JSON` sigue existiendo (apartado 8).
- [ ] Que la tarea programada de `/api/cron/purge-deleted` está activa.
- [ ] Borrar las 14 variables de legado (apartado 5).

**En Firebase:**
- [ ] Que `firestore.rules` y `storage.rules` están **desplegadas**.
- [ ] Que el **TTL** está activo sobre `_audit_logs` y `_rate_limits`.

**En GitHub:**
- [ ] Que el secreto `VERCEL_DEPLOY_HOOK_URL` sigue siendo válido.

**Administrativo, y no es un detalle:**
- [ ] **En qué plan** están Vercel y Firebase, **a nombre de quién va la factura**
      y qué pasa al agotar la cuota. Si la tarjeta caduca, el CRM se para.
- [ ] **A quién se llama**: soporte de Idealista, y el correo de la cuenta con la
      que se abrieron Firebase y Vercel.
- [ ] La **propiedad del código** (apartado 2).

**En la aplicación:**
- [ ] Rellenar **Amministrazione → Dati aziendali** (apartado 1).

---

## 14. Documentación complementaria

En `docs/`. Son registros de trabajo, no manuales, y **algunos describen estados
ya superados**:

- `docs/adr/0001`, `0002` — decisiones de arquitectura, vigentes.
- `docs/adr/0003` — describe **en pasado** una integración con Google Calendar que
  **ya no existe**. Está marcado como revertido: no leerlo como descripción del
  sistema.
- `docs/auditoria-pre-entrega.md`, `docs/remediacion-post-auditoria.md` — registro
  histórico. Citan ficheros ya borrados.
- `docs/decisiones-pendientes.md` — **parcialmente obsoleto**: dos de sus cinco
  decisiones ya se resolvieron.
- `docs/revocar-tokens-instrucciones.md`,
  `docs/reparar-vinculos-instrucciones.md` — instrucciones escritas **antes** de
  ejecutar los dos scripts. **Ambos se ejecutaron el 21/09/2026.**
