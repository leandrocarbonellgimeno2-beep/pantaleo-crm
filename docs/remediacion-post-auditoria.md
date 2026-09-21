# Remediación post-auditoría

Continuación de [`auditoria-pre-entrega.md`](auditoria-pre-entrega.md). Aquí está
qué se arregló, qué espera tu decisión y por qué.

Tests: **567** en 39 ficheros (eran 483 al empezar). `tsc --noEmit` limpio y
build en verde en cada commit.

---

## Objetivo A — bloquear y degradar surten efecto de verdad

Cerrado en `8e1b5ce`.

`tokenVersion` se escribía en cada cambio de rol, de estado y de contraseña, y
**no se comparaba en ningún sitio**: ni siquiera viajaba dentro de la cookie,
así que la comparación era imposible. Degradar a alguien de propietario a
agente no le quitaba un solo permiso hasta que caducaba su sesión, ocho horas
después. Varios comentarios del propio código afirmaban lo contrario, y yo
repetí esa afirmación en varios mensajes de commit anteriores. Era falsa.

Ahora `guard()` compara contra `_users` en cada petición, reutilizando la
lectura que ya se hacía para el bloqueo —**cero lecturas de más**— y se aplicó
a los 14 GET de negocio que no pasaban por él. Un usuario bloqueado o
degradado pierde el acceso en 30 segundos como mucho, y al instante en la
instancia que hizo el cambio.

14 tests, comprobados por mutación: revertir el origen del rol tumba 3;
quitar el guard de un GET tumba otros 3.

---

## Objetivo B — los documentos privados

El script está en `scripts/revocar-tokens-publicos.cjs` y **lo ejecutás vos**.
Los pasos exactos y los conteos están en
[`revocar-tokens-instrucciones.md`](revocar-tokens-instrucciones.md).

Resumen: **320 PDF** de `documenti_generati/` —folios de visita firmados y
contratos— son descargables sin ninguna credencial. Las 4.738 fotos no se
tocan.

### Dos correcciones sobre el informe

**Son 320, no 421.** El informe contaba ~101 documentos más en
`immobili/*/documenti`. En el bucket **no existe ni un objeto** bajo esa ruta:
los 4.295 de `immobili/` son fotos.

**`propiedades_fotos/` estuvo a punto de revocarse por error.** El primer
recuento lo clasificó como documento privado porque `esRutaPublica` no lo
reconocía: el guion bajo impide que `/^propiedades\//` lo capture. Son **443
fotos de 110 inmuebles vivos**. Revocarlas habría dejado la galería en blanco
en el CRM y en Idealista.

Lo que falló no fue el script: su comprobación previa hacía exactamente lo que
debía, verificar que su lista coincide con la de la aplicación. Coincidían. La
lista de la aplicación era la que estaba mal, deducida de la allowlist de
`sanitize.ts`, que nombra `inmuebles/` y `propiedades/` — y de esos dos
prefijos no hay **un solo objeto** en el bucket. El único prefijo heredado con
datos reales era justo el que faltaba.

Arreglado en `7e53292`, con test. Y el dry-run ahora publica un **censo de
todo el bucket**, no solo de lo que tocaría: un informe que solo enseña lo que
vas a romper no te enseña que estás a punto de romperlo.

---

## Objetivo C — lo que se arregló

| qué | dónde | commit |
|---|---|---|
| El listado de clientes no se ordenaba por fecha: los de esta semana caían en la posición 272 | `clienti/page.tsx` | `272ead2` |
| «Nessun cliente trovato» mientras cargaba los 576 | `clienti/page.tsx` | `272ead2` |
| Guardar una ficha de propietario borraba su vínculo con los inmuebles | `sanitize.ts` | `c4950cd` |
| Pinchar fuera de la ficha tiraba los documentos recién subidos | `proprietari/page.tsx` | `879e6bb` |
| El listado de documentos cortaba en 200 y dejaba 120 folios firmados inalcanzables | `documenti-generati/route.ts` | `1efa876` |
| El buscador de personas guardaba «undefined undefined» como nombre de la cita | `agenda/page.tsx` | `adba561` |
| El buscador de inmuebles pintaba filas en blanco y BORRABA la dirección | `agenda/page.tsx` | `adba561` |
| El buscador de propietarios ignoraba lo tecleado y costaba ~1.596 lecturas por tecla | `proprietari/route.ts` | `adba561` |
| En «Nuovo Cliente», Salva no se habilitaba jamás | `agenda/page.tsx` | `adba561` |
| Dos `if` sin else: cita sin nombre, y guardado fallido sin aviso | `agenda/page.tsx` | `adba561` |
| «Sincronizza Google» pintaba éxito VERDE cuando fallaba, y falla siempre | `agenda/page.tsx` | `4a5b028` |
| «Sincronizzazione automatica attiva» era una afirmación que el CRM no puede hacer | `agenda/page.tsx` | `4a5b028` |
| La firma del comprador se guardaba en un campo inexistente | `IncaricoAcquistoForm.tsx` | `8fd6fbb` |
| La subida de documentos usaba `alert()` como indicador y cantaba éxito antes de guardar | `immobili/page.tsx` | `ba3398f` |
| Con la sesión caducada, «Errore generico» y el agente reintentaba sin fin | `errores-http.ts` | `38af5be` |
| Tras crear un propietario, seguía pidiendo guardarlo antes de adjuntar | `proprietari/page.tsx` | `38af5be` |
| 92 clases de animación que no existían: los 18 overlays nunca se fundían | `globals.css` | `4e827ac` |
| Una foto se daba por guardada aunque el guardado fallara | `usePropertyImages.ts` | `4e827ac` |
| Los cuatro esqueletos de carga no se parecían al contenido real | 4 ficheros | `326d051` |
| «Hoy» se calculaba en UTC: de madrugada enseñaba las citas de ayer | `wall-clock.ts` | `39d61c3` |
| El DELETE de citas no saneaba el id, donde el PATCH sí | `appointments/route.ts` | `39d61c3` |
| Crear una cita decía `success` aunque no llegara a Google | `appointments/route.ts` | `39d61c3` |
| El convenio `middleware` de Next 16, migrado a `proxy` | `proxy.ts` | `965e23d` |

### Cuatro módulos nuevos, todos con tests

- **`lib/fecha-ms.ts`** — la conversión de fecha estaba escrita **cuatro
  veces**, cada copia entendiendo un subconjunto distinto de las formas. Dos
  tenían su propio fallo.
- **`lib/etiquetas.ts`** — nombre, teléfono, dirección y referencia, que los
  buscadores leían de campos que en esa forma no existen.
- **`lib/errores-http.ts`** — qué decir ante un 401 y ante un 403.
- **`tests/unit/firmas-coherentes.test.ts`** — recorre los cinco formularios y
  exige que cada recuadro de firma lea, escriba y borre el mismo campo.

---

## Lo que espera tu decisión

### 1. Reparar los 17 propietarios con el vínculo dañado — recomiendo hacerlo

Guardar una ficha escribía `['id','id']` encima de los IDs reales de
`immobili_collegati`. **Eso ya no pasa** (`c4950cd`), pero 17 de los 726
propietarios quedaron así; 10 conservan IDs de verdad.

Son **reconstruibles sin adivinar nada**: la dirección autoritativa es
`immobili.proprietarioId`, que es justo la que el GET ya recorre para el
contador. Si decís que sí, te preparo el script con dry-run, como el de los
tokens.

### 2. Vincular los documentos a su cliente — es un cambio de producto

El CRM tiene un candado que impide borrar un cliente con documentos generados
asociados. Compara `clienteId` y **ningún formulario lo escribe**: los 320
documentos lo tienen vacío, así que el candado no ha saltado nunca.

No es una línea: los cinco formularios se abren **sin ningún contexto de
cliente** —el agente escribe el nombre a mano—, así que hay que añadirles un
selector de cliente. Eso cambia lo que el agente tiene que hacer para generar
un documento.

Mientras tanto, el diálogo de borrado dice la verdad (`ba3398f`) en vez de
dejar creer que alguien está comprobando algo. Los 320 ya guardados no se
pueden vincular por nombre con garantías.

### 3. Paginación del matching — hay una contrapartida que te toca decidir

Cada «Carica altri 10 risultati» vuelve a leer los 870 inmuebles y a
puntuarlos otra vez para devolver 10 filas **que la primera llamada ya había
calculado y ordenado**. Un cliente con 50 coincidencias cuesta 5 escaneos
completos: 4.350 lecturas.

El arreglo es devolver la lista entera en la primera llamada y paginar en
pantalla, como ya hacen las otras rejillas. Ni el orden ni el conjunto
cambian, porque la ruta ya los calcula enteros.

**La contrapartida, medida:** el peor cliente de la base da 311 coincidencias
= **542 KB de payload**, frente a 17 KB por página. Cambia dos contratos de
API y sus dos consumidores.

Mi recomendación: hacerlo. 4.350 lecturas recurrentes pesan más que 542 KB una
vez, y ese peor caso es un cliente de 311 coincidencias, no el habitual. Pero
es tu llamada y por eso no lo toqué.

### 4. Borrado en duro de los folios firmados — recomiendo cambiarlo

La papelera de un folio lo borra de Firestore y del bucket **a la vez**. Sin
papelera, sin purga diferida como en las otras tres colecciones, y sin
constancia de quién lo borró. La propia ruta está escrita como si el
soft-delete existiera: los dos GET filtran `_status !== 'pendente_cancellazione'`
y nadie escribe nunca ese centinela.

Es un documento firmado con valor legal. No lo toqué porque cambia el ciclo de
vida de una colección y toca el cron de purga.

### 5. Volver a vincular el calendario de Google — acción tuya

El enlace murió el 20 de marzo. Desde `a0763bb` el botón de vincular exige rol
propietario, así que solo podés hacerlo vos. Hasta entonces **ninguna cita
llega al calendario compartido**; ahora al menos el CRM lo dice en vez de
pintar un tic verde.

### 6. `FIREBASE_STORAGE_BUCKET` en tu `.env.local` apunta a un bucket que no existe

En producción no está fallando —las fotos se ven, las subidas funcionan—, así
que el valor de Vercel debe ser el bueno o no estar puesto. Conviene alinear el
de local: `/api/upload` y `/api/files` usan esa misma expresión, y si alguien
copia el `.env.local` a Vercel las subidas empiezan a fallar.

### 7. Frescura de las listas — no lo toqué porque es un ajuste, no un fallo

Volver a un listado después de más de 5 segundos vuelve a leer la colección.
Los tres hooks ya tienen `keepPreviousData` y `revalidateOnFocus: false`; lo
único que queda es `dedupingInterval: 5000`. Subirlo a 30-60 s cortaría
lecturas, a cambio de que un cambio hecho por otro agente tarde más en verse.
Con cuatro agentes trabajando a la vez, esa decisión es tuya.

---

## Lo que NO se tocó, a propósito

- **`AUTH_USERS_JSON`** y la colección `users`: tarea tuya.
- **Fase 6.2** (Server Components): no iniciada.
- **Ningún dato de negocio.** Todo lo de arriba es código. Lo único que roza el
  almacenamiento es el script de revocación, y lo ejecutás vos.
