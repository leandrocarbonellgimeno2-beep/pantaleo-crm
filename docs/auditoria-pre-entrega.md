# Auditoría integral pre-entrega — CRM Pantaleo

- **Fecha**: 2026-09-20
- **Sobre**: `master` en `57150f8`, con producción en uso y datos reales
- **Alcance**: funcionalidad, responsive, accesibilidad, rendimiento, firma y
  documentos, formularios, búsqueda, seguridad y consistencia visual

---

## Cómo se hizo

Dos frentes en paralelo, porque ninguno de los dos ve lo que ve el otro.

**Auditoría de código**: veinte agentes, diez auditando una dimensión cada uno
y diez escépticos intentando tumbar lo que el primero afirmaba, abriendo ellos
mismos el código y midiendo ellos mismos los datos. De 172 hallazgos
propuestos, **los escépticos descartaron 57** por falsos, por severidad mal
puesta o por estar mal clasificados. Quedan **115 confirmados**.

**Auditoría en vivo**: la aplicación levantada con sesión iniciada y datos de
producción, medida con el navegador. Geometría renderizada a 375, 768 y 1280
píxeles, axe-core sobre las seis pantallas, cascada de peticiones por pantalla,
peso real de los chunks y una prueba de la firma en el formulario real.

La regla de oro se respetó sin excepciones: **la auditoría solo leyó datos**.
Todo lo que se arregló es código. Lo que exigiría tocar datos guardados está
señalado abajo esperando tu decisión.

---

## Lo primero, porque es una corrección mía

En varios commits de los últimos bucles escribí que *«la revocación por
tokenVersion sigue intacta»*. **Es falso, y conviene que lo sepas antes que
nada.**

`tokenVersion` se escribe en cada cambio de rol, de estado y de contraseña,
pero **no se compara en ningún sitio, y ni siquiera viaja dentro de la cookie**,
así que la comparación es imposible sin cambiar el formato del token. Lo
comprobó el auditor por cuatro vías y lo he verificado: `SessionPayload` lleva
email, nome, ruolo, iat y exp, y nada más.

Consecuencia práctica: **degradar a alguien de propietario a agente no le quita
ni un permiso hasta que caduque su sesión, hasta ocho horas después.** Bloquear
sí funciona para escrituras, porque eso se mira contra el `status` en Firestore.
Degradar, no.

No lo verifiqué cuando lo escribí: heredé la afirmación del comentario del
propio código, que también la da por cierta en tres sitios. Es exactamente el
tipo de cosa que una auditoría debe encontrar, y la encontró.

---

## Resumen y veredicto

**115 hallazgos confirmados**: 2 críticos, 18 altos, 41 medios, 54 bajos.
84 son bugs, 26 decisiones de producto y 5 rediseños.

| dimensión | estado |
|---|---|
| Responsive | **sano**. Cero desborde horizontal en las seis pantallas a 375, 768 y 1280 |
| Accesibilidad | **sano tras arreglar**. De 12 violaciones de axe a **0** en las seis pantallas |
| Rendimiento | **sano**. Sin N+1, sin librerías pesadas en el arranque, 2 peticiones por pantalla |
| Firma | **tenía un fallo grave, arreglado y verificado** |
| Funcionalidad | sólida, con tres pérdidas de datos encontradas y arregladas |
| Seguridad | **es la dimensión floja**, y lo que queda depende de decisiones tuyas |

### Qué tan lista está para entregar: **80%**

Y el 20% que falta no es código a medio hacer: es **control de acceso y datos
heredados**.

Lo que sostiene el 80: la aplicación funciona, está en uso diario, tiene 469
tests, CI en verde, no desborda en ningún tamaño de pantalla, no tiene una sola
violación de accesibilidad automática, carga con dos peticiones por pantalla y
ninguna librería pesada en el arranque. El trabajo de los bucles anteriores
—índices, mutación local, clasificación de filtros, diálogos— se sostiene bajo
el escrutinio.

Lo que impide llegar al 100, por orden:

1. **421 ficheros privados son descargables desde internet sin sesión** — 320
   folios de visita firmados y 101 contratos y planimetrías. Verificado con un
   `curl` sin credenciales: HTTP 200 y el PDF entero. El código ya está
   arreglado para lo nuevo; lo expuesto es lo subido antes del arreglo del 19 de
   septiembre. **Requiere tu decisión porque tocar esos ficheros es tocar datos.**
2. **La revocación de permisos no funciona** (arriba).
3. **Bloquear una cuenta no corta la lectura**: ningún GET de negocio pasa por
   el guard, incluido `/api/files`. Un ex-empleado con la pestaña abierta sigue
   descargando durante ocho horas.
4. **`AUTH_USERS_JSON` convierte en propietario a todo el que entre por ahí**, y
   lo graba de forma permanente. La agencia tiene sus roles reales escritos en
   otra colección (`users`, sin guion bajo) que el código no mira: cuatro
   «agent» y un «admin».

Ninguna de las cuatro es un fallo de programación al uso. Tres son decisiones
que te corresponden y la cuarta es una migración que decidiste posponer.

---

## Estado responsive, medido

Contando geometría renderizada en la aplicación real, no leyendo clases.

| pantalla | 375 px (teléfono) | 768 px (tablet) | 1280 px (escritorio) |
|---|---|---|---|
| `/` | sin desborde · 0 objetivos pequeños | sin desborde | sin desborde |
| `/immobili` | sin desborde · 0 | sin desborde | sin desborde |
| `/clienti` | sin desborde · 0 | sin desborde | sin desborde |
| `/proprietari` | sin desborde · 0 | sin desborde | sin desborde |
| `/agenda` | sin desborde · 0 | sin desborde | sin desborde |
| `/documenti` | sin desborde · 0 | sin desborde | sin desborde |

**Objetivos táctiles**: antes de esta auditoría había **548 elementos
interactivos por debajo de 44 px** en el teléfono, 403 de ellos solo en
`/documenti`. Ahora son **0**, y el diseño de escritorio no cambió ni un píxel
—la regla se aplica con `pointer: coarse`, que mira el dedo y no el ancho—.

El barrido anterior se había quedado corto por un fallo de método que conviene
no repetir: recorría el JSX buscando clases `h-8`/`h-9`/`h-10` con una expresión
que paraba en el primer `>`, y en `onClick={() => …}` ese `>` está dentro de la
flecha. Todos los botones con manejador en línea quedaron fuera del escaneo.
Medir lo renderizado no tiene ese problema.

---

## Accesibilidad, medida con axe-core

| pantalla | antes | después |
|---|---|---|
| `/` | 2 | **0** |
| `/immobili` | 3 | **0** |
| `/clienti` | 2 | **0** |
| `/proprietari` | 1 | **0** |
| `/agenda` | 1 | **0** |
| `/documenti` | 3 | **0** |

Lo arreglado: dos tablas con desplazamiento horizontal que no recibían foco
(`serious`), la barra de navegación del móvil que era un `<div>` y dejaba sus
seis etiquetas fuera de todo landmark **en cada página**, dos pantallas sin
`<h1>`, dos `<h1>` por página compitiendo, y encabezados de tarjeta saltándose
niveles en cinco pantallas.

Sobre el contraste: axe marcó seis nodos en una primera pasada y cero en las
siguientes. Lo comprobé aparte calculando la razón a mano —`--muted-foreground`
es `hsl(215 16% 47%)`, que sobre blanco da **4,70:1** y pasa el mínimo AA de
4,5—. El aviso salía midiendo a mitad de la animación de entrada, con la
opacidad por debajo de 1. El token no se toca.

---

## Rendimiento, medido

| pantalla | peticiones a la API | peso de la respuesta |
|---|---|---|
| `/` | 6 (una duplicada, ver abajo) | 9 KB en total |
| `/immobili` | 2 | 630 KB |
| `/clienti` | 2 | 717 KB |
| `/documenti` | 3 | 103 KB |

**Sin patrones N+1**: ninguna pantalla pide un documento por elemento de lista.

Los 630 y 717 KB son el coste aceptado de la decisión del [ADR 0001](./adr/0001-sin-paginacion-por-cursor.md):
traer el conjunto y filtrar en cliente. En producción Vercel los comprime a
unos 70–90 KB. A cambio, los 23 filtros responden sin tocar la red.

**Bundles**: 59 chunks, 4,7 MB sin comprimir. El más gordo con diferencia es
`@react-pdf` con **1,5 MB**, y está correctamente fuera de la carga inicial —
comprobado contra los manifiestos—. `react-dropzone` también, desde el bucle
anterior.

`/api/stats` se pide dos veces en el inicio. Solo hay un consumidor en el
código, así que es el doble montaje de React en desarrollo; en producción,
además, su `s-maxage=60` lo serviría de caché. Queda como observación, no como
fallo.

---

## Lo que se arregló en esta auditoría

| qué | severidad | commit |
|---|---|---|
| Girar el teléfono podía sustituir una firma legal por un garabato | alto | `44deedd` |
| Borrar la última foto destruía el fichero y dejaba viva la URL | **crítico** | `f9ffe22` |
| Guardar una ficha de cliente recién abierta borraba la firma digital | alto | `e9865f7` |
| Cualquier usuario podía reapuntar el calendario de la agencia al suyo | alto | `a0763bb` |
| 548 objetivos táctiles por debajo de 44 px en el móvil | medio | `a253ae5` |
| 12 violaciones de axe-core en las seis pantallas | medio | `4358b69` |

### Sobre la firma, que es el que más importa

`react-signature-canvas` trae su propio oyente de `resize` que redimensiona el
lienzo y, al hacerlo, lo limpia. Medido en el formulario real: firmar a 375×812
y girar a 812×375 dejaba el recuadro con **cero** píxeles de tinta.

Lo grave no era que desapareciera de la vista. El valor guardado sobrevive
—se auto-guarda al terminar cada trazo— pero si el cliente, viendo el recuadro
en blanco, remata la rúbrica o roza el lienzo, lo que se guarda y se estampa en
el PDF es **solo ese último trazo**. Una firma legal sustituida por un garabato,
sin un aviso. Afecta a los cinco formularios de documentos.

El arreglo es `clearOnResize={false}`, una prop de la propia librería.
Verificado con el mismo instrumento que midió el fallo: 231 píxeles de tinta
antes de girar, **231 después**.

Antes de dar con eso intenté repintar la firma a mano tras el resize, primero
con `fromDataURL` y luego con `drawImage`. Las dos versiones la dejaban ocupando
el 1% del recuadro en una esquina, y **no conseguí demostrar cuál de las dos
cosas fallaba** —el repintado o mi propia firma sintética, que ya salía pequeña
antes de girar—. Revertí sin commitear: no se toca el componente de la firma
legal con un cambio que no se puede verificar.

---

## Lo que espera tu decisión

### 1. Los 421 ficheros privados expuestos — lo más urgente

Verificado con `curl` sin ninguna credencial: un folio de visita firmado
responde **HTTP 200, `application/pdf`, 35.971 bytes**.

| qué | cuántos |
|---|---|
| Folios de visita firmados y contratos (`documenti_generati/`) | **320** |
| Contratos, identidades y planimetrías de inmuebles (`immobili/*/documenti/`) | **101** |
| Fotos de inmuebles — **correcto que sean públicas**, Idealista las necesita | 4.370 |

`storage.rules` ya es *deny-all* y el propio fichero documenta el agujero: las
URLs con `firebaseStorageDownloadTokens` **no pasan por las reglas**. El código
se arregló el 19 de septiembre (`08e369e`) y desde entonces los ficheros
privados reciben una URL tras sesión; el problema es lo subido antes. El
documento generado más reciente es del 11 de septiembre, o sea que **todo lo
expuesto es anterior al arreglo**.

No lo toco porque arreglarlo significa modificar datos guardados. Las opciones:

- **(a) Cerrar del todo.** Borrar el metadato `firebaseStorageDownloadTokens` de
  esos 421 objetos y reescribir la URL guardada a la forma `/api/files?path=…`.
  Los ficheros ya están en el bucket y `/api/files` ya sabe servirlos, así que
  las pantallas siguen funcionando igual. **Rompe cualquier enlace que se haya
  compartido ya con un cliente o un notario.**
- **(b) Cerrar solo lo nuevo y convivir.** No tocar nada y aceptar que esos 421
  siguen accesibles para quien tenga el enlace. Los enlaces existentes siguen
  valiendo.
- **(c) A medias.** Cerrar los 101 de `immobili/*/documenti/` —que son los que
  llevan DNI y datos bancarios— y dejar los 320 folios, que suelen compartirse.

Mi recomendación es **(a)**, y avisar antes a quien pueda tener un enlace
guardado. Son datos personales de clientes en un CRM inmobiliario.

### 2. La revocación de permisos

Dos caminos, y el segundo es más barato:

- Meter `tokenVersion` en el payload que firma `signSession` y compararlo en el
  guard junto al bloqueo.
- **Sin tocar la cookie**: que la comprobación de bloqueo —que ya lee el
  documento de `_users` y ya está cacheada 30 s— devuelva también el rol de la
  base, y que `guard()` exija el mínimo contra **ese** rol en vez de contra el
  de la cookie. Coste añadido: cero lecturas.

Recomiendo el segundo. Y en cualquier caso corregir los tres comentarios del
código que hoy afirman lo contrario.

### 3. Que bloquear corte también la lectura

Ningún GET de negocio pasa por el guard, incluido `/api/files`. No es un
descuido evidente: los GET son baratos y el middleware ya exige sesión. Pero
significa que «Disattiva» no hace lo que promete. Un `guardLectura(request)` de
una línea al principio de cada GET —solo sesión y bloqueo, sin exigir nivel— lo
cierra sin cambiar ningún permiso por rol.

### 4. `AUTH_USERS_JSON` y la colección `users`

Ya decidiste posponerlo, pero la auditoría encontró algo que quizá cambie el
orden: existe una colección **`users`** (sin guion bajo) con cinco documentos
creados el 1 de febrero, con los roles reales de la agencia —`info@` como
`admin` y cuatro personas como `agent`— y **el código no la mira en ninguna
línea**. Los roles verdaderos ya están escritos; lo que falta es darlos de alta
en `_users` con la nomenclatura nueva.

Mientras tanto, cualquiera que entre por `AUTH_USERS_JSON` se graba como
**propietario permanente**, y ve la pestaña de administración.

---

## Hallazgos por dimensión

Todo lo confirmado, con lo descartado por los escépticos anotado en cada
dimensión. Los de severidad media y baja van plegados.

### 1. Autenticación, sesión y roles

> La criptografia de sesion y el hashing de contrasenas estan bien hechos y medidos: HMAC-SHA256 con separacion de dominio frente al state de OAuth, scrypt con parametros dentro del hash y una igualacion de tiempos que he cronometrado y funciona (47,1 ms contra 46,2 ms). El reparto de permisos por nivel tambien es solido en el eje de ESCRITURA: he enumerado los 37 route.ts y todos los POST/PUT/PATCH/DELETE de negocio pasan por guard(). El problema esta en el eje de REVOCACION: tokenVersion se escribe en cada cambio de rol, estado o contrasena, pero no se compara en ningun sitio y ni siquiera viaja dentro de la cookie, asi que degradar a alguien o cambiarle la contrasena no tiene efecto durante

**10 hallazgos confirmados** · 5 descartados por el escéptico

#### ALTO · 320 fogli di visita firmados siguen siendo descargables por cualquiera con el enlace, sin sesion y para siempre

- **Tipo**: producto
- **Dónde**: `storage.rules:16`
- **Qué ve el usuario**: El hallazgo 2 del auditor dice que una cuenta bloqueada sigue bajando documentos por /api/files durante ocho horas. La realidad es peor y no la vio: TODOS los fogli di visita de la agencia llevan una URL publica con token guardada en Firestore. Quien haya sido usuario alguna vez —un agente despedido, alguien a quien se le puso Disattiva— solo necesita haber abierto una vez /api/documenti-generati (GET sin guard) para llevarse las 320 URLs. Esas URLs no caducan, no pasan por la cookie, no pasan por storage.rules y no las corta ni bloquear, ni degradar, ni cerrar la sesion, ni rotar SESSION_SECR
- **Estado**: **pendiente de tu decisión**
- **Arreglo propuesto**: NO SE TOCA sin permiso: quitar los tokens rompe cualquier enlace que se haya compartido ya con un cliente o un notario, y eso es decision del dueno. Las opciones: (a) borrar el metadato firebaseStorageDownloadTokens de esos 320 objetos del bucket y reescribir urlDownload a la forma /api/files?path=... en los 320 documentos de documenti_generati —los ficheros ya estan en el bucket y /api/files ya sabe servirlos, asi que la pantalla /documenti sigue funcionando igual—; (b) si se prefiere no tocar 

#### ALTO · tokenVersion se escribe en cada cambio pero no se compara jamas: degradar de rol o cambiar la contrasena no revoca nada

- **Tipo**: bug
- **Dónde**: `src/lib/api-guard.ts:67`
- **Qué ve el usuario**: El propietario degrada a alguien en Amministrazione, o le pone una contrasena nueva. El panel dice que si y la fila cambia. Esa persona conserva sus permisos anteriores en todas las rutas hasta ocho horas despues, con su sesion abierta. Y si la contrasena se cambia justamente porque se sospecha que la robaron, la sesion del ladron sigue viva.
- **Estado**: pendiente
- **Arreglo propuesto**: Meter tokenVersion dentro del payload que firma signSession (auth.ts:60) y compararlo en guard() junto al bloqueo: es una lectura de Firestore que ya se hace y ya esta cacheada 30 s. Y corregir las dos frases que hoy afirman lo contrario: users.ts:298-302 («Ese numero es lo que permite invalidar una sesion ya emitida») y AdminPanel.tsx:14 («la revocacion por tokenVersion sigue intacta»). La tercera frase que cita el auditor, users.ts:36, es la unica que dice la verdad: «todavia no se compara».

#### ALTO · Bloquear una cuenta no corta la lectura: ningun GET de negocio pasa por el guard

- **Tipo**: bug
- **Dónde**: `src/app/api/files/route.ts:34`
- **Qué ve el usuario**: Se despide a alguien y el propietario le pone «Disattiva». Con la pestana ya abierta, esa persona no puede escribir nada mas —eso si funciona, en 30 s— pero sigue listando clientes, propietarios e inmuebles, sigue descargando planimetrias y documentos por /api/files y sigue apareciendo conectada en el panel de presencia durante lo que le quede de sesion, hasta ocho horas.
- **Estado**: pendiente
- **Arreglo propuesto**: Sacar la comprobacion de bloqueo de guard() a una funcion propia y llamarla al principio de cada GET de negocio y de /api/files: solo sesion + bloqueo, sin exigir nivel. No cambia ningun permiso por rol, solo hace que «Disattiva» signifique lo que dice. El middleware no puede hacerlo porque corre en Edge y firebase-admin no funciona alli.

#### ALTO · ROL_LEGACY='propietario': quien entre por AUTH_USERS_JSON se graba como propietario para siempre

- **Tipo**: producto
- **Dónde**: `src/app/api/auth/login/route.ts:30`
- **Qué ve el usuario**: La proxima vez que entre alguien que aun no este en _users, quedara escrito alli como propietario, de forma permanente y silenciosa: puede crear usuarios, leer el registro de auditoria entero, descargar el backup completo de la base (/api/backup-db exige propietario) y borrar inmuebles y clientes. Arreglarlo despues exige un PATCH manual desde el panel, y por el hallazgo del tokenVersion ese PATCH tampoco le quita el rol hasta que caduque su sesion.
- **Estado**: **pendiente de tu decisión**
- **Arreglo propuesto**: NO SE TOCA sin permiso: es decision de negocio. Opciones para que el dueno elija: (a) dar de alta a las personas desde el panel con su rol real ANTES de que vuelvan a entrar y borrar despues AUTH_USERS_JSON de Vercel, con lo que todo el bloque de fallback se retira; (b) si se quiere mantener el fallback, sustituir ROL_LEGACY por el rol que traiga el JSON pasado por normalizeRole, que es exactamente lo que resuelve la tabla de alias de roles.ts (admin->secretaria, agent->agente, ya implementada y

<details>
<summary>6 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | La sesion caduca de golpe a las 8 horas y el formulario largo del inmueble presenta ese 401 como un error generico | `hooks/usePropertyDetail.ts:148` |
| MEDIO | bug | /api/calendar/auth no comprueba rol: cualquier sesion, incluida la de solo lectura, puede reenlazar el calendario de la agencia | `auth/route.ts:5` |
| BAJO | bug | El limite de intentos es solo por IP y lo consumen tambien los logins correctos | `login/route.ts:123` |
| BAJO | bug | Con AUTH_USERS_JSON ausente o mal formada el login distingue cuentas: 503 si el correo no existe, 401 si existe | `login/route.ts:183` |
| BAJO | bug | Cerrar sesion no refresca la identidad en el navegador: el siguiente usuario ve el nombre y el correo del anterior | `contexts/AuthContext.tsx:60` |
| BAJO | bug | La salvaguarda del ultimo propietario cuenta fuera de la transaccion | `users/route.ts:224` |

</details>

### 2. Flujo del inmueble

> El flujo del inmueble esta, en lo estructural, bien hecho: el contador de codigos, el contador numero_immobili de los propietarios, el borrado en blando con su purga y las escrituras por field path aguantan la auditoria contra los datos reales sin un solo descuadre. Lo que falla esta en los bordes, y uno de esos bordes DESTRUYE DATOS: borrar la ULTIMA foto de un inmueble elimina el fichero del bucket y deja la referencia viva en Firestore, y hay una victima real en produccion (codice 12172, 19 de junio de 2026). El segundo problema serio no destruye nada guardado pero si trabajo: la ficha en modo edicion se cierra con Escape, con «Chiudi» y con la X sin preguntar nada, que es exactamente el 

**9 hallazgos confirmados** · 3 descartados por el escéptico

#### CRÍTICO · Borrar la ULTIMA foto destruye el fichero y deja la referencia viva en Firestore

- **Tipo**: bug
- **Dónde**: `src/app/api/immobili/route.ts:197`
- **Qué ve el usuario**: El agente borra la unica foto de un inmueble. La pantalla dice que se borro y la tarjeta se queda sin foto. El fichero desaparece del bucket, pero Firestore conserva la URL: al recargar, la ficha vuelve a decir «1 foto» con la imagen rota. Lo mismo al vaciar la galeria foto a foto: los pasos intermedios se guardan y el ultimo (1 -> 0) no.
- **Estado**: **ARREGLADO** en `f9ffe22`

<details>
<summary>8 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | onDrop se traga el fallo del guardado: las fotos se ven en la ficha aunque no se hayan guardado | `hooks/usePropertyImages.ts:104` |
| MEDIO | bug | Escape, «Chiudi» y la X cierran la ficha en modo edicion y tiran lo escrito sin avisar | `immobili/PropertyDetailModal.tsx:90` |
| BAJO | bug | Tocar una foto de un inmueble que no esta en la lista actual inyecta una tarjeta fantasma | `immobili/page.tsx:284` |
| BAJO | bug | Pulsar «Modifica» antes de que termine la carga: la respuesta que llega tarde pisa lo tecleado | `hooks/usePropertyDetail.ts:90` |
| BAJO | bug | La subida de planimetria y atto no se persiste, y los tres inputs no exigen que el inmueble exista | `immobili/page.tsx:248` |
| BAJO | bug | Si el contador atomico de codigos falla, el inmueble nace con el codigo «---» | `immobili/route.ts:280` |
| BAJO | bug | El borrado del fichero en Storage exige rol «secretaria» mientras quitar su referencia solo exige «vendedor», y la respuesta no se mira | `hooks/usePropertyImages.ts:142` |
| BAJO | producto | 27 inmuebles arrastran 101 enlaces a planimetrias, atti y visure que no existen en el bucket | `immobili/PropertyEditForm.tsx:485` |

</details>

### 3. Flujo de clientes y propietarios

> La dimension esta partida en dos. El vinculo propietario-inmueble esta SANO y medido: 870/870 inmuebles activos tienen proprietarioId y proprietarioId_real y valen lo mismo, cero huerfanos, cero contadores descuadrados, y belongsToProprietario cubre bien el DELETE. En cambio el flujo del CLIENTE tiene tres agujeros graves y verificados contra produccion: el listado no esta ordenado por nada util (los 30 clientes mas recientes de verdad caen en las posiciones 272-281, fuera de la primera pagina), guardar una ficha recien abierta puede escribir la firma digital y los documentos VACIOS encima de los reales, y el candado que deberia impedir borrar un cliente con folios de visita firmados nunca s

**11 hallazgos confirmados** · 8 descartados por el escéptico

#### ALTO · El listado de clienti no se ordena por fecha: los clientes de este mes caen en la posicion 272

- **Tipo**: bug
- **Dónde**: `src/app/clienti/page.tsx:340`
- **Qué ve el usuario**: Al abrir Clienti, arriba salen Mario Pantaleo (19-05), Annamaria Fontanazza (07-04) y Selma Nasri (11-05). Los dados de alta esta semana (FLAVIA VELTRI, Giuseppe Casubolo, MARTINA CUPIN, IGNAZIO PALADINO, todos del 10-09) no estan en la primera pantalla: hay que pulsar 'Carica altri 30' nueve veces o buscarlos por nombre. Con el filtro Vendita o Affitto activo la consulta ni siquiera lleva orderBy.
- **Estado**: pendiente
- **Arreglo propuesto**: Normalizar createdAt a milisegundos en un solo sitio y ordenar con eso. La funcion ya existe y funciona: proprietari/page.tsx:29-41 (createdAtMs) acepta Timestamp, {_seconds}/{seconds}, toMillis(), ISO y numero. Aplicarla en el sort de clienti/page.tsx:339-343. En api/clienti/route.ts:54 el orderBy no puede arreglarse sin normalizar el dato, porque Firestore ordena por TIPO antes que por valor; mientras convivan los tres tipos el orden util tiene que salir del cliente. Cualquier backfill de crea

#### ALTO · Guardar una ficha de cliente recien abierta borra la firma digital

- **Tipo**: bug
- **Dónde**: `src/app/api/clienti/route.ts:149`
- **Qué ve el usuario**: El agente pincha una ficha, el pad de firma sale en blanco porque el documento completo aun no ha llegado o el fetch fallo sin avisar (page.tsx:407-419, el fallo solo hace console.error y el `if (res.ok)` se salta el error en silencio). Cambia el telefono, pulsa Salva, y el cliente se queda sin firma para siempre.
- **Estado**: **ARREGLADO** en `e9865f7`

#### ALTO · El candado que impide borrar un cliente con folios de visita firmados nunca salta: clienteId se guarda vacio

- **Tipo**: bug
- **Dónde**: `src/app/api/clienti/route.ts:198`
- **Qué ve el usuario**: Un agente borra un cliente y el CRM le deja, sin la advertencia 'Impossibile eliminare: il cliente ha documenti generati associati' que se escribio justo para eso. Sus folios de visita firmados quedan colgando de un nombre escrito a mano.
- **Estado**: pendiente
- **Arreglo propuesto**: Pasar clienteId en los cinco formularios; saveDocumentToCloud.ts ya lo acepta (opts.clienteId, linea 77) y DOCUMENTI_GENERATI_ALLOWED ya lo permite (sanitize.ts:220), solo falta que los formularios lo manden. Para los 320 documentos ya guardados NO hay arreglo por nombre (ver mi nota); lo honesto es que el guard proteja de ahora en adelante y que el dialogo de borrado advierta de que puede haber folios antiguos sin vincular. Tocar los 320 documentos es escritura sobre datos de negocio: no se hac

<details>
<summary>8 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | Guardar la ficha de un propietario devuelve a Firestore el relleno ['id','id'] que el GET fabrica para pintar | `proprietari/route.ts:67` |
| MEDIO | producto | El matching del cliente es de solo ida: no se puede registrar el resultado de una proposta ni deshacerla | `clienti/page.tsx:1197` |
| BAJO | bug | El boton Salva del cliente manda el array Matching entero y puede pisar una proposta de otro agente | `clienti/page.tsx:130` |
| BAJO | producto | La firma del cliente nunca guarda su fecha: DataFirma se declara, se permite y no la escribe nadie | `types/cliente.ts:183` |
| BAJO | bug | La pestana Immobili del propietario lista tambien los inmuebles marcados para borrar | `immobili/route.ts:21` |
| BAJO | bug | MatchingOps: mandar add y remove del mismo array en la misma peticion pierde una de las dos mitades | `clienti/route.ts:129` |
| BAJO | bug | El alta de inmueble sigue sumando el contador a ciegas en vez de usar el servicio de recuento | `immobili/route.ts:300` |
| BAJO | producto | Los propietarios sin inmuebles desaparecen de la lista y el buscador tampoco los encuentra | `proprietari/page.tsx:49` |

</details>

### 4. Agenda y calendario

> La agenda es la unica dimension del CRM que NO esta en uso: la coleccion `appointments` no existe siquiera en Firestore (listCollections devuelve 14 colecciones y esa no esta; un `.get()` sobre ella devuelve 0 documentos). El nucleo horario, que es donde estaba el dano historico, esta bien resuelto: una cita a las 09:00 se guarda como dos cadenas ("date"/"time"), se relee tal cual y sale hacia Google como hora de pared desnuda con timeZone Europe/Rome; lo verifique ejecutando la funcion y el resultado es exacto. El problema real esta en el otro extremo: el enlace con Google Calendar lleva muerto desde el 20 de marzo de 2026 y el CRM sigue pintando "Sincronizzazione automatica attiva" en verd

**13 hallazgos confirmados** · 5 descartados por el escéptico

#### ALTO · Cualquier usuario autenticado, sea cual sea su rol, puede reapuntar el calendario de la agencia a su Google personal

- **Tipo**: bug
- **Dónde**: `src/app/api/calendar/callback/route.ts:66`
- **Qué ve el usuario**: Un usuario del CRM navega a /api/calendar/auth, consiente con SU cuenta de Google, y el callback reescribe calendar_configs/default_admin con sus tokens. A partir de ahi cada cita de la inmobiliaria —nombre del cliente, direccion del inmueble y telefono en la descripcion del evento (google-calendar.ts:78)— aterriza en su calendario privado, y la agencia deja de recibirlas. En el registro no queda quien fue.
- **Estado**: **ARREGLADO** en `a0763bb`

<details>
<summary>12 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | El boton «Sincronizza Google» pinta un aviso VERDE de exito cuando la sincronizacion falla, y hoy falla siempre | `agenda/page.tsx:168` |
| MEDIO | bug | «Sincronizzazione automatica attiva» es mentira: el enlace con Google murio el 20 de marzo y el estado se decide mirando si existe una cadena | `get-status/route.ts:13` |
| MEDIO | producto | «Sincronizza Google» no puede importar ni una sola cita futura: el limite superior es siempre AHORA | `sync/route.ts:27` |
| BAJO | bug | Si la sincronizacion con Google falla al crear una cita, el usuario recibe un exito y no se entera nunca | `appointments/route.ts:77` |
| BAJO | bug | La regla global de 44px hace que las celdas del calendario del mes se solapen por debajo de ~348 px | `app/globals.css:210` |
| BAJO | bug | El endurecimiento de CALENDAR_CONFIG_ID se dejo fuera a sync y a appointments, y de rebote la cita no guarda que agente la creo | `sync/route.ts:25` |
| BAJO | bug | El DELETE de citas no sanea el id del documento, en el mismo fichero donde el PATCH si lo hace | `appointments/route.ts:141` |
| BAJO | producto | Borrar una cita es fisico e inmediato: se salta el soft-delete que protege a las otras tres colecciones y no deja rastro | `appointments/route.ts:149` |
| BAJO | bug | La importacion desde Google pisa el nombre del cliente con el titulo del evento y reinicia el estado de la cita | `sync/route.ts:104` |
| BAJO | producto | Las notas de la cita se guardan y no se leen en ninguna parte | `agenda/page.tsx:797` |
| BAJO | producto | No hay ninguna comprobacion de solapamiento, y la de cita en el pasado solo mira el dia, no la hora | `appointments/route.ts:57` |
| BAJO | bug | El panel de inicio calcula «hoy» en UTC: entre medianoche y las 02:00 de Marsala ensena las citas de ayer | `app/page.tsx:46` |

</details>

### 5. Documentos y firma

> La firma digital es la pieza mas fragil del CRM y hoy esta rota por varios sitios a la vez. El fallo mayor no es de este codigo sino de como se usa react-signature-canvas: el componente trae `clearOnResize` a true por defecto y SignaturePad.tsx no lo desactiva, asi que UN solo evento `resize` del navegador —girar la tablet, que salga el teclado, que se pliegue la barra del navegador— borra el lienzo; si el cliente da un trazo mas despues, el auto-guardado sustituye la firma entera por ese fragmento. Lo he reproducido en el navegador con el signature_pad real del proyecto. Ademas, en IncaricoAcquistoForm la firma del comprador se escribe en un campo que no existe y el PDF sale sin firma. Del 

**14 hallazgos confirmados** · 6 descartados por el escéptico

#### ALTO · Un evento resize limpia el lienzo y el trazo siguiente SUSTITUYE la firma entera

- **Tipo**: bug
- **Dónde**: `src/components/ui/SignaturePad.tsx:156`
- **Qué ve el usuario**: El cliente firma en la tablet. Al girar el aparato (o al plegarse la barra del navegador al hacer scroll, porque useDialog dice explicitamente que NO bloquea el scroll del fondo) la firma desaparece del recuadro. Si el valor en memoria no se vuelve a tocar, el PDF sale bien y solo hay confusion; pero si el cliente remata la rubrica o roza el recuadro, lo que se guarda y se estampa es SOLO ese ultimo trazo. Afecta a los 11 pads del CRM (5 formularios, clienti y proprietari).
- **Estado**: **ARREGLADO** en `44deedd`

#### ALTO · El listado de documentos corta en 200 y deja 120 folios firmados inalcanzables

- **Tipo**: bug
- **Dónde**: `src/app/api/documenti-generati/route.ts:33`
- **Qué ve el usuario**: Hay 320 folios en Firestore y la pantalla Documenti solo puede ver 200. Todo lo anterior al 2026-06-19 —120 documentos, 59 de ellos CON la firma del cliente— no se puede listar, ni buscar, ni descargar, ni reabrir desde la aplicacion: el buscador filtra en memoria sobre los 200 ya traidos. Si hay que reclamar una provvigione con un folio de mayo, la agencia no puede sacarlo del CRM. Y empeora solo: el ritmo es de ~65 documentos al mes, asi que cada dos meses caen otros 120 al pozo.
- **Estado**: pendiente
- **Arreglo propuesto**: Paginar (startAfter por dataCreazione con boton 'carica altri') o mover la busqueda al servidor. Mientras tanto, lo minimo es avisar en pantalla de que la lista esta truncada, en vez de fingir que esos 320 son 200.

#### ALTO · Los 320 PDF de folios firmados siguen siendo publicos con URL permanente y sin sesion

- **Tipo**: bug
- **Dónde**: `src/lib/storage-urls.ts:30`
- **Qué ve el usuario**: Cualquiera con una de esas URLs —de un log, del historial, de un reenvio— se descarga el verbale firmado entero sin pasar por el login: nombre, telefono, direccion, inmueble visitado, importe de provvigione y la firma manuscrita. El arreglo de storage-urls solo afecta a subidas nuevas y nadie revoco los tokens viejos.
- **Estado**: pendiente
- **Arreglo propuesto**: Migracion en dos pasos y CON PERMISO, porque toca datos de negocio: (a) borrar firebaseStorageDownloadTokens de los 320 objetos de documenti_generati/, (b) reescribir urlDownload a /api/files?path=... con extraerRutaDeUrl. Ojo: revocar tokens rompe cualquier enlace ya compartido con un cliente. Y actualizar el comentario de storage.rules, que sigue diciendo que el token se estampa en cada fichero que sube.

#### ALTO · Los folios firmados se borran en DURO: sin soft-delete, sin auditoria y sin vuelta atras

- **Tipo**: bug
- **Dónde**: `src/app/api/documenti-generati/route.ts:86`
- **Qué ve el usuario**: Una secretaria pulsa la papelera de un folio, confirma, y el verbale firmado desaparece de Firestore (route.ts:86) y del bucket (documenti/page.tsx:563-564) a la vez. No hay papelera, no hay purga diferida como en las otras tres colecciones y no queda constancia de quien lo borro. La propia ruta esta escrita como si el soft-delete existiera: los dos GET filtran _status !== 'pendente_cancellazione' y nadie escribe nunca ese centinela.
- **Estado**: pendiente
- **Arreglo propuesto**: Usar markForSoftDelete tambien en documenti_generati (y documenti_template), incluir la coleccion en el cron de purga, pasar la sesion para el registro de auditoria y no borrar el PDF de Storage hasta que la purga se consuma.

<details>
<summary>10 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | Ningun formulario escribe clienteId: los 320 documentos son huerfanos y el guard 409 de clienti es codigo muerto | `lib/saveDocumentToCloud.ts:77` |
| MEDIO | bug | IncaricoAcquistoForm guarda la firma del comprador en un campo inexistente: el PDF sale sin firma | `documenti/IncaricoAcquistoForm.tsx:288` |
| MEDIO | producto | Se puede guardar un Foglio di Visita sin ninguna firma y nadie avisa | `documenti/FoglioVisitaForm.tsx:540` |
| MEDIO | producto | Un clic o toque suelto en el recuadro se guarda como firma del cliente | `ui/SignaturePad.tsx:99` |
| MEDIO | producto | Reabrir y guardar crea un documento nuevo: el archivo esta lleno de pares borrador/firmado sin distintivo | `lib/saveDocumentToCloud.ts:68` |
| BAJO | bug | Abrir un cliente y guardarlo antes de que llegue el refetch sobrescribe su FirmaDigitale con vacio | `clienti/page.tsx:130` |
| BAJO | bug | SignaturePad no reacciona a que `value` cambie despues de montarse | `ui/SignaturePad.tsx:96` |
| BAJO | bug | «Riapri e modifica» esta roto para los cuatro Incarichi: el boton siempre falla | `documenti/page.tsx:531` |
| BAJO | producto | 61 rutas de planimetrias, visuras y atti referenciadas en immobili no existen en Storage | `immobili/PropertyEditForm.tsx:485` |
| BAJO | bug | FIREBASE_STORAGE_BUCKET de .env.local no es el bucket real | `.env.local:9` |

</details>

### 6. Búsqueda y filtros

> La búsqueda de texto y los doce filtros del LISTADO están sanos: los arreglos de piano, StatoFiniture, «sin zona» y los rangos numéricos se sostienen contra los datos y no encontré ningún otro desajuste ahí. El agujero está en el SMART-MATCHING y en los campos del CLIENTE, que se quedaron fuera de aquellos bucles: el formulario del cliente ofrece «Posto Auto Coperto» (clave PostoAutoCoperto) mientras el catálogo guarda ese concepto en PostoAuto, y los dos conjuntos no comparten ni un documento —55 clientes marcan esa casilla y 47 de ellos tienen hoy CERO resultados—. El mismo patrón, en forma más suave, afecta a PostoAutoScoperto (137 clientes, 192 matches en vez de 1.326), a la escala de ac

**11 hallazgos confirmados** · 7 descartados por el escéptico

#### ALTO · La casilla «Posto Auto Coperto» del cliente es un exterminador: la clave existe en 12 de los 631 activos y deja a 47 de sus 55 clientes con la pantalla vacía

- **Tipo**: producto
- **Dónde**: `src/lib/smart-matching.ts:602`
- **Qué ve el usuario**: La agente marca «Posto Auto Coperto» en la ficha del cliente, pulsa «Lancia Matching», y la pantalla se queda vacía o con dos o tres inmuebles. 47 de los 574 clientes vivos están hoy así.
- **Estado**: **pendiente de tu decisión**
- **Arreglo propuesto**: Decidir con la agencia qué significa la casilla antes de tocar nada. Tres opciones reales: (a) que «coperto» se satisfaga también con Garage —556 activos lo tienen— porque un box ES plaza cubierta; (b) que la casilla puntúe en vez de eliminar, como ya hacen pianoScore y statoFinitureScore con el dato desconocido; (c) retirarla del formulario del cliente hasta que el catálogo la tenga rellena. Lo que NO vale es la propuesta del informe de tratar PostoAuto como sinónimo: ver el tumbado. No reescri

#### ALTO · El gate de características sigue dando por «no lo tiene» una clave que nadie rellenó, y la guarda que el bucle anterior puso contra eso no protege a NINGÚN inmueble activo

- **Tipo**: producto
- **Dónde**: `src/lib/smart-matching.ts:599`
- **Qué ve el usuario**: Un cliente que pide plaza descubierta ve dos o tres inmuebles o ninguno; 64 de los 137 que la piden están a cero. Y el arreglo que se hizo en el bucle anterior para esto no ha mejorado nada en producción, aunque sus tests pasen.
- **Estado**: **pendiente de tu decisión**
- **Arreglo propuesto**: Decisión de la agencia. Si se acepta el principio que el propio commit 6526207 dice defender —no convertir «no lo sé» en «no»—, hay que llevarlo del nivel de mapa al nivel de clave: medir la cobertura de cada clave y, cuando falte en más de la mitad de las fichas, puntuar neutro en vez de eliminar. Ojo: el test tests/unit/smart-matching-caratteristiche.test.ts:40-45 fija a propósito el comportamiento contrario, así que el cambio exige tocar ese test, y eso no se hace sin permiso.

<details>
<summary>9 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | 34 clientes guardan zonas que no existen en zonas.json, valen 0 de 20 puntos siempre, y la ficha no las enseña ni deja borrarlas | `clienti/page.tsx:911` |
| MEDIO | producto | Ni el formulario del cliente ni el del inmueble conocen tres de los ocho estados de acabado reales, entre ellos «Normali», que son 299 inmuebles | `types/cliente.ts:54` |
| BAJO | bug | NUEVO — La curva de proximidad de acabados no es la que su comentario y su commit dicen reproducir: 271 emparejamientos vivos dependen de la diferenci | `lib/smart-matching.ts:368` |
| BAJO | bug | NUEVO — La pantalla de matching no distingue «no he buscado» de «he buscado y no hay nada»: los 91 clientes a cero ven el mismo cartel que antes de pu | `clienti/page.tsx:1181` |
| BAJO | bug | El smart-matching sigue haciendo Number(campo \|\| 0): 16 inmuebles sin metros sacan los 9 puntos enteros de superficie | `lib/smart-matching.ts:676` |
| BAJO | bug | La casilla «Posto Auto» del filtro está congelada —ningún formulario escribe ya esa clave— y el comentario que justifica dejar fuera a las demás tiene | `immobili/filters.ts:140` |
| BAJO | producto | La preferencia de planta del cliente no contempla «Basso», que son 291 de los 631 activos: el arreglo de piano quedó a medias | `lib/smart-matching.ts:396` |
| BAJO | bug | Los comentarios del presupuesto dicen 15% cuando el código hace 5% a propósito: no es un fallo del número, es un comentario que miente | `lib/smart-matching.ts:246` |
| BAJO | rediseño | El tope de 1000 documentos está al 87% con 870 inmuebles: al pasarlo, la búsqueda de texto y el matching empezarán a ignorar inmuebles sin avisar | `immobili/list-limits.ts:30` |

</details>

### 7. Seguridad de los endpoints

> La superficie de API está, en lo estructural, bien defendida: 37 rutas, firestore.rules y storage.rules en deny-all comprobados, ningún secreto en el bundle de cliente (cero `process.env.` en componentes 'use client'), el `state` de OAuth firmado con separación de dominio y nonce en cookie HttpOnly, rate-limit distribuido en Firestore, y 23 de las 37 rutas con `guard()` por nivel de rol. Lo que falla no es el diseño, son los arreglos que se aplicaron a medias: el mismo patrón corregido en una ruta sigue vivo en la de al lado. `sanitizeFirestoreId` se aplica en 3 rutas y falta en 8; `CALENDAR_CONFIG_ID` se hizo constante en el callback y en get-status pero `/api/calendar/sync` y `/api/appoint

**9 hallazgos confirmados** · 7 descartados por el escéptico

#### CRÍTICO · 320 folios de visita firmados son descargables sin sesion desde internet — y NO hay un solo fichero privado en el bucket

- **Tipo**: bug
- **Dónde**: `C:/Users/Leandro Carbonell/Desktop/pantaleo-crm/storage.rules:14`
- **Qué ve el usuario**: Quien tenga una de esas URLs —historial, reenvio, backup, log— se descarga el folio firmado: nombre del cliente, firma manuscrita e inmueble visitado. No caduca, no se revoca al cerrar sesion y no pasa por storage.rules. El nombre del fichero lleva el apellido y el nombre del cliente en claro (forma medida: documenti_generati/Foglio_Visita_-_<APELLIDO_NOMBRE>_<ts>.pdf).
- **Estado**: pendiente
- **Arreglo propuesto**: Migracion en dos pasos, y TOCA DATOS DE NEGOCIO: necesita permiso explicito antes de ejecutarse. (1) Borrar el metadato firebaseStorageDownloadTokens de los 320 ficheros bajo documenti_generati/ — eso invalida la URL publica al instante. (2) Reescribir urlDownload de los 320 documentos a /api/files?path=documenti_generati/<fichero>, forma que ya entienden el visor, el DELETE de /api/upload y el cron de purga (extraerRutaDeUrl la acepta, storage-urls.ts:66) y cuyo prefijo ya esta en STORAGE_PREFI

#### ALTO · AUTH_USERS_JSON compara contrasenas en claro y la migracion graba 'propietario' de forma permanente en _users

- **Tipo**: producto
- **Dónde**: `C:/Users/Leandro Carbonell/Desktop/pantaleo-crm/src/app/api/auth/login/route.ts:205`
- **Qué ve el usuario**: Quien no este en _users entra por la rama 2 del login: comparacion contra la contrasena EN CLARO del JSON (:172, confirmado por :199, donde para migrar hay que hashearla) y sesion emitida con ruolo: ROL_LEGACY = 'propietario' (:30, :219), ignorando a proposito el rol del JSON. Y lo que no se ve: migrarUsuarioDesdeLegacy recibe ruolo: ROL_LEGACY (:205) y escribe role: 'propietario' en el documento de _users (services/users.ts:128, :138). O sea, la marca temporal se vuelve permanente: borrar AUTH_USERS_JSON manana NO arregla los roles, porque ya estaran mal grabados en _users y habra que corregi
- **Estado**: **pendiente de tu decisión**
- **Arreglo propuesto**: Decision del dueno, no se toca sin permiso. La ventana barata es AHORA, antes de que el equipo entre: dar de alta desde el panel a cada persona con su rol REAL (agente para quien solo consulta, vendedor para quien vende, secretaria para gestion), comprobar que _users tiene tantos documentos como personas, y solo entonces borrar AUTH_USERS_JSON de Vercel y quitar de login/route.ts el bloque de fallback (:167-226) junto con ROL_LEGACY. Si el equipo entra antes, hay que anadir un paso: repasar y co

<details>
<summary>7 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | La revocacion de sesion no existe: tokenVersion se escribe y nadie la compara, asi que degradar de rol no surte efecto en 8 horas | `services/users.ts:330` |
| MEDIO | bug | Los 101 documentos de 27 inmuebles apuntan a ficheros que no existen en el bucket | `immobili/route.ts:40` |
| BAJO | bug | El id del documento de calendario sigue saliendo de la peticion en /api/calendar/sync y en /api/appointments | `sync/route.ts:25` |
| BAJO | bug | Los GET de Idealista no tienen guard y meten el id de la peticion en la URL del proveedor sin validarlo | `contacts/route.ts:117` |
| BAJO | bug | 546 fotos legacy viven bajo un prefijo que el saneador rechaza, y al borrarlas quedan huerfanas en el bucket sin que nadie se entere | `lib/sanitize.ts:85` |
| BAJO | bug | sanitizeFirestoreId se aplica en 3 rutas y falta en 8, incluido el DELETE del mismo fichero cuyo PATCH si lo aplica | `appointments/route.ts:141` |
| BAJO | bug | 26 respuestas de error devuelven el mensaje de la excepcion tal cual, incluida la respuesta del OAuth de Idealista | `lib/idealista-auth.ts:51` |

</details>

### 8. Rendimiento

> El rendimiento de este CRM está, en lo grueso, bien trabajado: no hay ni un patrón N+1, la paginación es visual (cargar más no genera tráfico), los PDF pesados (@react-pdf 1.523 KB, jspdf 408 KB, pdf-lib 384 KB, leaflet 145 KB) están fuera del arranque en chunks perezosos, `unoptimized` solo se activa para blob:/data:, y el dashboard resuelve sus contadores con 8 agregaciones count() en vez de descargar colecciones. El JS inicial medido es 262-294 KB gz por ruta según la pantalla, y los dos builds (turbopack y webpack) coinciden. Lo que sí encuentro son cuatro cosas medibles: un buscador de la agenda sin debounce contra una ruta que ignora `q` y `limit` y devuelve 1.596 lecturas y los 726 pr

**7 hallazgos confirmados** · 1 descartados por el escéptico

#### ALTO · La paginación del matching vuelve a leer la colección entera en cada «Carica altri»

- **Tipo**: bug
- **Dónde**: `src/app/api/match/route.ts:31`
- **Qué ve el usuario**: En la pestaña Matching de un cliente, cada clic en «Carica altri 10 risultati» vuelve a leer los 870 inmuebles (1.927 KB) y a puntuarlos otra vez para devolver 10 filas que la primera llamada ya había calculado y ordenado. Lo mismo en la ficha del inmueble con el matching inverso: 576 clientes por página. Un cliente con 50 coincidencias cuesta 5 escaneos completos, 4.350 lecturas de Firestore, para enseñar una lista que ya estaba entera en memoria del servidor en la primera llamada.
- **Estado**: pendiente
- **Arreglo propuesto**: El camino sin cambiar resultados es el que ya usa el resto del CRM: la ruta devuelve la lista completa ya puntuada y ordenada en la llamada de página 0, y el cliente pagina visualmente (igual que PropertyGrid y que las rejillas de clienti/proprietari). Ni el orden ni el conjunto de coincidencias cambian, porque la ruta YA los calcula enteros hoy. Contrapartida medida, para que se decida con el dato: el peor cliente de la base da 311 coincidencias = 542 KB de payload frente a los 17 KB de una pág

<details>
<summary>6 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | El buscador de propietarios de la agenda no filtra y cuesta 1.596 lecturas por tecla | `agenda/page.tsx:176` |
| MEDIO | bug | Volver a un listado enseña esqueleto y relee la colección teniendo los datos en caché | `hooks/useImmobiliFilters.ts:66` |
| MEDIO | rediseño | El listado arrastra 767 KB de URLs de fotos desde Firestore para tirarlas acto seguido | `immobili/route.ts:122` |
| MEDIO | producto | /api/proprietari lee los 870 inmuebles en cada carga para recalcular un contador que ya está bien | `proprietari/route.ts:29` |
| MEDIO | rediseño | /clienti y /proprietari son un solo componente con la lista y la ficha dentro, sin un memo | `clienti/page.tsx:443` |
| BAJO | bug | handleLoadMore se recrea en cada render y anula el React.memo de PropertyGrid | `immobili/page.tsx:189` |

</details>

### 9. Formularios

> Los formularios del CRM están divididos en dos mundos. Los que la agencia usa a diario —ficha de inmueble, ficha de cliente, los cinco de documentos, alta de usuario, cambio y reseteo de contraseña, login y el cajón de filtros— están razonablemente sanos: botón deshabilitado mientras se guarda en los doce, mensajes en italiano, validación cliente/servidor coincidente donde importa (password mínimo 10 en los dos lados), autocompletado de contraseñas correcto, y los datos escritos se conservan si el guardado falla. La agenda, en cambio, está rota de punta a punta: el modo «Nuovo Cliente» no deja pulsar Salva nunca, elegir un cliente del buscador escribe literalmente «undefined undefined» como 

**16 hallazgos confirmados** · 8 descartados por el escéptico

#### ALTO · Un clic en el velo cierra la ficha de propietario y se lleva los documentos subidos, que solo viven en memoria

- **Tipo**: bug
- **Dónde**: `src/app/proprietari/page.tsx:244`
- **Qué ve el usuario**: Se adjunta el documento de identidad del propietario, aparece en la lista, se pincha fuera del panel para «salir» — y el fichero queda huérfano en Storage mientras la ficha vuelve a verse sin él. Nada avisa. Y mientras sube no se ve absolutamente nada: ni spinner, ni bloqueo del input.
- **Estado**: pendiente
- **Arreglo propuesto**: Dos cosas separadas: (a) quitar `fondoScheda` del velo (línea 595), como ya hicieron clienti, immobili y agenda, o pedir confirmación si hay cambios sin guardar; (b) añadir un estado `subiendo` que bloquee el input y pinte el spinner, como ya hace documenti/page.tsx:705-712 con `uploading`.

<details>
<summary>15 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | La agenda no deja crear una cita con «Nuovo Cliente»: Salva no se habilita jamás | `agenda/page.tsx:827` |
| MEDIO | bug | El buscador de clientes de la agenda guarda «undefined undefined» como nombre de la cita | `agenda/page.tsx:648` |
| MEDIO | bug | El buscador de inmuebles de la agenda pinta filas en blanco y BORRA la dirección al elegir una | `agenda/page.tsx:740` |
| MEDIO | bug | Con la sesión caducada, cinco de los seis formularios dicen «Errore durante il salvataggio» y el agente reintenta sin fin | `hooks/usePropertyDetail.ts:148` |
| MEDIO | bug | La subida de documentos del inmueble usa alert() como indicador de carga y canta «caricato con successo» cuando aún no se ha guardado nada | `immobili/page.tsx:254` |
| MEDIO | producto | No hay ninguna guarda de trabajo sin guardar: ni al recargar, ni al cerrar la pestaña, ni al pulsar Escape en las tres fichas | `documenti/FoglioVisitaForm.tsx:240` |
| MEDIO | producto | El 52% de los fogli di visita se guarda sin la firma del cliente, y el formulario no lo impide | `documenti/FoglioVisitaForm.tsx:540` |
| MEDIO | bug | En modo «Proprietario», el buscador de personas de la agenda ignora lo que se teclea y lista los 726 propietarios, sin debounce | `agenda/page.tsx:176` |
| MEDIO | bug | Tras crear un propietario, la ficha se queda abierta pero sigue diciendo que hay que guardarlo antes de adjuntar documentos | `proprietari/page.tsx:305` |
| BAJO | bug | Crear una cita falla en silencio: el if no tiene rama else | `agenda/page.tsx:244` |
| BAJO | bug | El botón «Cambia» del propietario, en la ficha del inmueble, no hace nada en absoluto | `immobili/PropertyEditForm.tsx:114` |
| BAJO | producto | Al dar de alta un inmueble la ficha se cierra, y el área de fotos —que exige el inmueble guardado— queda a dos viajes | `hooks/usePropertyDetail.ts:168` |
| BAJO | bug | «Riapri e modifica» no puede funcionar para ninguno de los cuatro incarichi, por dos motivos distintos | `documenti/IncaricoEsclusivaForm.tsx:355` |
| BAJO | bug | «Hoja Legal & Firma» y las etiquetas de rol están en castellano, no en italiano | `clienti/page.tsx:714` |
| BAJO | producto | El alta de inmueble y la de propietario no validan nada, ni en cliente ni en servidor | `hooks/usePropertyDetail.ts:129` |

</details>

### 10. Consistencia visual

> La dimensión está a medio camino: la base es mejor de lo que suele verse y el italiano de la interfaz es sólido, pero los estados de carga son el punto débil real. Lo sano: los 12 listados tienen estado vacío, todos en italiano y casi todos con una frase útil que dice qué hacer; `no-scrollbar` SÍ está definida (globals.css:186); hay un `error.tsx` en italiano que tranquiliza sobre los datos; y de las ~13.600 líneas de JSX solo hay UNA cadena de clases con utilidades en conflicto. Lo que está mal: cuatro de los cinco esqueletos de carga no se parecen al contenido que llega después —el de /proprietari es una TABLA de 5 filas que resuelve a una rejilla de 4 columnas, y /immobili pinta la foto d

**15 hallazgos confirmados** · 7 descartados por el escéptico

#### ALTO · /clienti muestra «Nessun cliente trovato» mientras carga los 576 clientes

- **Tipo**: bug
- **Dónde**: `src/app/clienti/page.tsx:633`
- **Qué ve el usuario**: Al entrar en Clientes, la pantalla más usada, el agente ve durante la ventana de carga un cartel que afirma que no hay ningún cliente («Nessun cliente trovato / Crea il tuo primo lead o modifica i filtri di ricerca»), y acto seguido aparecen los 576. Falso negativo que invita a crear un duplicado. Además el objeto `search` del PageHeader (líneas 454-458) tampoco recibe `loading`, así que la lupa nunca se convierte en spinner, al revés que /immobili (page.tsx:322 `loading: loading \|\| isFilterTransitioning`).
- **Estado**: pendiente
- **Arreglo propuesto**: Condicionar el vacío a `filteredClienti.length === 0 && !loading` y pasar `loading` dentro del objeto `search` del PageHeader, como ya hace /immobili. Mejor aún: enseñar la rejilla de esqueleto mientras `loading`.

<details>
<summary>14 hallazgos de severidad media y baja</summary>

| sev | tipo | qué | dónde |
|---|---|---|---|
| MEDIO | bug | 89 clases de animación que no existen en el CSS compilado: los 18 overlays nunca se funden | `app/globals.css:1` |
| MEDIO | bug | El esqueleto interno de /proprietari es una tabla de 5 columnas y el contenido real es una rejilla de tarjetas | `proprietari/page.tsx:427` |
| MEDIO | bug | El esqueleto de ruta de /immobili no coincide con la rejilla real: tres alturas de foto encadenadas | `immobili/loading.tsx:25` |
| MEDIO | bug | El esqueleto de /clienti es una lista de una columna y el contenido real es una rejilla de hasta cuatro | `clienti/loading.tsx:22` |
| MEDIO | bug | El esqueleto de ruta de /documenti pinta una lista de tarjetas y la pantalla real son dos tablas | `documenti/loading.tsx:18` |
| MEDIO | bug | La ficha de un propietario se titula «Scheda Cliente» | `proprietari/page.tsx:619` |
| MEDIO | bug | La etiqueta de las Note Riservate se pinta gris en vez de rosa por dos clases de color en conflicto | `immobili/PropertyEditForm.tsx:598` |
| MEDIO | bug | El aviso de «cargando…» de la subida de ficheros congela la propia subida hasta que se pulsa OK | `immobili/page.tsx:254` |
| MEDIO | producto | El color de marca está partido: --primary es azul y la interfaz está pintada de índigo | `app/globals.css:20` |
| BAJO | rediseño | Una misma etiqueta de formulario escrita de 19 maneras, y cinco tamaños de letra fuera de escala | `agenda/page.tsx:684` |
| BAJO | bug | Fugas de inglés y de español en una interfaz italiana | `documenti/page.tsx:602` |
| BAJO | rediseño | Las dos fichas gemelas, cliente y propietario, discrepan en casi todo salvo en la función | `proprietari/page.tsx:612` |
| BAJO | bug | El titular de /agenda pesa 700 y el de las otras cinco pantallas 900 | `agenda/page.tsx:303` |
| BAJO | producto | Queda un tema oscuro completo definido que nada puede activar | `app/globals.css:40` |

</details>

---

## Cómo reproducir estas mediciones

```bash
node scripts/auditar-filtros.cjs                    # los 12 filtros contra los datos
node scripts/verificar-sospeso.cjs                  # recuentos del catálogo
node scripts/inspeccionar-coleccion.cjs <coleccion> # radiografía de una colección
npm run build                                       # pesos y chunks
```

Las tres herramientas **solo leen**. Las mediciones del navegador —geometría
responsive, axe-core y la prueba de la firma— se hicieron con la aplicación
levantada en local contra los datos de producción, con una sesión firmada para
poder ver las pantallas reales.

## Lo que esta auditoría NO cubrió

- **No se probó el envío de ningún formulario.** Abrir un modal no escribe
  nada, pero pulsar «Salva» sí, y la regla de oro lo prohíbe. Los hallazgos de
  formularios salen de leer el código, no de ejecutarlo.
- **No se midió en un teléfono real.** El navegador emula 375 px con cinco
  puntos táctiles, que es suficiente para geometría y para `pointer: coarse`,
  pero no sustituye a firmar con el dedo en una tablet de verdad.
- **No se auditó el PDF generado.** Habría que generar uno, y eso escribe.
- **La tablet se midió sin emulación táctil**, así que la regla de 44 px no se
  activó en esa medición. En un iPad real sí lo hará, porque `pointer: coarse`
  es cierto ahí.
