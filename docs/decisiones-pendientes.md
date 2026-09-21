# Las 5 decisiones de producto que esperan tu definición

Salen de [`auditoria-pre-entrega.md`](auditoria-pre-entrega.md). No son bugs con
arreglo evidente: en las cinco hay que decidir **qué tiene que hacer el CRM**,
y esa parte no la decido yo.

El informe tiene 21 hallazgos marcados como «producto». Estas son las cinco que
bloquean algo o que cuestan dinero; el resto son mejoras que pueden esperar sin
consecuencia.

Los números de abajo los medí contra la base de producción hoy, 21 de
septiembre. Donde difieren del informe, lo digo.

---

## 1. Los folios firmados se borran en duro, sin papelera y sin rastro

**Qué es.** La papelera de un folio lo borra de Firestore **y del bucket a la
vez**. No hay papelera, no hay purga diferida como en las otras tres
colecciones, y no queda constancia de quién lo borró. Lo llamativo: la propia
ruta está escrita *como si* el soft-delete existiera —los dos GET filtran
`_status !== 'pendente_cancellazione'`— y nadie escribe nunca ese centinela.

**Impacto.** Un verbale firmado, con valor legal y la firma manuscrita del
cliente, desaparece con dos clics y sin vuelta atrás. Si hace falta para
reclamar una provvigione, se acabó.

**Mi recomendación.** Usar `markForSoftDelete` como en `immobili`, `clienti` y
`proprietari`, incluir la colección en el cron de purga, pasar la sesión para
el registro de auditoría, y **no borrar el PDF del bucket hasta que la purga se
consuma**. Es la que más riesgo real cierra de las cinco.

**¿Post-entrega?** **No.** Recomiendo hacerlo antes. Si no da tiempo, la
alternativa de un minuto es quitar el botón de borrar y que se pida por
teléfono: un borrado irreversible de un documento legal no debería estar a dos
clics de un agente con prisa.

---

## 2. Reabrir y guardar crea un documento nuevo: el archivo es casi mitad duplicados

**Qué es.** Cada vez que se reabre un folio y se guarda, se crea otro
documento. No se actualiza el anterior ni se marca como superado.

**Impacto, medido.** Los 320 documentos del archivo son en realidad **171
visitas**: sobran **149 copias**, el 47 % del archivo. Y no es que un cliente
visitara dos veces:

- el **95 %** de los pares se crean **el mismo día** (el 24 % en menos de una hora)
- **130 de los 149 pares (87 %)** siguen exactamente el patrón
  *borrador sin firma → copia firmada en menos de 24 h*

Buscar un folio devuelve dos resultados casi idénticos y nada dice cuál es el
bueno. Es además la razón de que el archivo llegara al tope de 200 tan pronto.

**Mi recomendación.** Al reabrir un documento, **actualizar el existente** en
vez de crear otro; o, si preferís conservar el historial, guardar el nuevo y
marcar el anterior como superado para que no salga en la lista. Lo que **no**
haría es borrar retroactivamente los 149 duplicados: son documentos guardados y
la regla de oro manda.

**¿Post-entrega?** Sí, pero es la que más ensucia el día a día. La pondría
primera de las post-entrega.

---

## 3. Un Foglio di Visita se puede guardar sin ninguna firma, y el recuadro del agente no se usa nunca

**Qué es.** El formulario deja guardar sin firma y no avisa. Además, un clic o
un toque suelto en el recuadro se guarda como firma válida.

**Impacto, medido — y aquí corrijo al informe.** El informe dice «el 52 % se
guarda sin la firma del cliente». Ese 52 % es **por documento**, y mezcla los
borradores con los finales (ver la decisión 2). Agrupando por visita:

- **140 de 171 visitas (82 %) sí tienen al menos una copia firmada**
- **31 visitas (18 %) no tienen firma en ninguna copia**

18 % sigue siendo mucho para un documento que respalda una comisión, pero es un
problema bastante menor que el que sugería el 52 %.

Hallazgo nuevo, que no estaba en el informe: **`firmaAgente` está vacía en los
320**. El recuadro «Firma Agente» existe en el formulario y no se ha usado ni
una sola vez.

**Mi recomendación.** Avisar al guardar sin firma del cliente —«questo
documento non ha la firma del cliente, salvare comunque?»— en vez de bloquear:
guardar un borrador sin firma es legítimo y es justo lo que hace el flujo de
hoy. Y decidir qué pasa con el recuadro del agente: o se empieza a usar o se
quita, porque hoy es un hueco muerto en un documento legal.

**¿Post-entrega?** El aviso, **no**: es barato y cada folio sin firma es una
comisión difícil de reclamar. Bloquear el guardado, y lo del recuadro del
agente, sí.

---

## 4. Los documentos no saben de qué cliente son

**Qué es.** Los cinco formularios de documentos se abren **sin ningún contexto
de cliente**: el agente escribe el nombre a mano. `clienteId` se guarda vacío en
los 320. El candado que impide borrar un cliente con documentos asociados
compara ese campo, así que **no ha saltado nunca y no va a saltar**.

**Impacto.** Borrar un cliente deja sus folios firmados colgando de un nombre
escrito a mano. Y no hay forma de preguntar «qué documentos tiene este
cliente». El aviso del diálogo de borrado ya dice la verdad (`ba3398f`), pero
eso es avisar, no proteger.

**Mi recomendación.** Añadir un selector de cliente a los cinco formularios,
reutilizando el typeahead que ya existe en `/documenti` para compilar
plantillas. Los 320 ya guardados **no** los vincularía por nombre: los nombres
están escritos a mano, con mayúsculas y espacios inconsistentes, y una
coincidencia equivocada ataría un documento firmado al cliente que no es.

**¿Post-entrega?** **Sí.** Cambia lo que el agente tiene que hacer para generar
un documento, y no es el momento de cambiar un flujo diario justo antes de
entregar.

---

## 5. Los vocabularios incompletos degradan el matching en la mitad del catálogo

**Qué es.** Ni el formulario del cliente ni el del inmueble conocen tres de los
ocho estados de acabado que existen de verdad en los datos —entre ellos
«Normali», que son **299 inmuebles**—. Y la preferencia de planta del cliente no
contempla «Basso», que son **291 de los 631 activos**.

**Impacto.** Un cliente no puede pedir lo que más abunda en el catálogo, y esos
inmuebles puntúan por debajo de lo que les toca en cada emparejamiento. Afecta
a más de la mitad del inventario.

**Mi recomendación.** Añadir los valores que faltan a las dos listas. Es una
decisión y no un arreglo obvio porque hay que elegir: ¿se añaden tal cual los
ocho estados reales, o se consolidan los que significan lo mismo con nombres
distintos? Esa elección cambia cómo puntúa el matching, así que la tenés que
tomar vos mirando el vocabulario real de la agencia. Yo puedo darte el listado
de valores distintos con su recuento para decidirlo con el dato delante.

**¿Post-entrega?** Sí, pero pronto: mientras tanto el matching está rindiendo
por debajo de lo que puede en la mitad del catálogo.

---

## Lo que no entra en la lista, y por qué

- **La guarda de trabajo sin guardar** (recargar, cerrar la pestaña, Escape) es
  un hallazgo MEDIO real, pero no necesita decisión: avisar antes de perder lo
  escrito es correcto siempre. Es tiempo, no criterio. Ya quité el caso peor
  —pinchar fuera de la ficha de propietario se llevaba los documentos recién
  subidos— en `879e6bb`.
- **La paginación del matching** (4.350 lecturas por cliente) es una decisión
  técnica con una contrapartida medida, no de producto. Está en
  [`remediacion-post-auditoria.md`](remediacion-post-auditoria.md).
- **Volver a vincular Google Calendar** y **el bucket de `.env.local`** son
  tareas operativas tuyas, no decisiones. También están en ese informe.
