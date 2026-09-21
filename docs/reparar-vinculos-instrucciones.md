# Reparar el vínculo propietario ↔ inmuebles — instrucciones para Leandro

**Esto lo ejecutás vos.** Yo dejé el script y el recuento; no lo corrí contra
producción.

---

## Qué problema cierra

`GET /api/proprietari` fabrica `immobili_collegati: Array(n).fill('id')` para
pintar las tarjetas del listado. La ficha de propietario reenviaba ese relleno
en el PATCH, y Firestore se quedaba con `['id','id']` **en lugar de los IDs
reales**. Cada vez que alguien abría y guardaba una ficha, se destruía el
vínculo de ese propietario con sus inmuebles.

El código ya no lo hace: `numero_immobili` e `immobili_collegati` salieron de
`PROPRIETARI_ALLOWED` en `c4950cd`, así que `sanitizeBody` los descarta. Lo que
queda es reparar lo que se dañó **antes** de ese arreglo.

---

## Por qué esto es una reconstrucción y no una adivinanza

El vínculo está guardado **dos veces**, en las dos direcciones:

```
proprietari/{id}.immobili_collegati   →  [ids de inmuebles]
immobili/{id}.proprietarioId          →  id del propietario
```

Las dos las escribe la misma transacción: vincular hace
`arrayUnion(propertyId)` **y** pone `proprietarioId` en el inmueble;
desvincular hace `arrayRemove` **y** borra `proprietarioId`.

El relleno solo corrompió la dirección del propietario. La inversa
—`immobili.proprietarioId`— nunca se tocó, y es la que usa de verdad todo el
CRM: el contador del listado, `proprietari-counter.ts` y la pestaña «Immobili»
de la ficha salen todos de ella.

**No se infiere nada: se copia el dato que sigue intacto al campo que se
perdió.**

---

## Qué dijo el recuento (dry-run, 21 de septiembre)

726 propietarios, 870 inmuebles.

| estado de `immobili_collegati` | cuántos |
|---|---:|
| sin el campo | 696 |
| con IDs reales | 10 |
| array vacío `[]` | 3 |
| **dañado, solo relleno** | **17** |
| dañado, relleno mezclado con IDs reales | 0 |

**Se repararían los 17.** Ninguno se salta. En los 17, `numero_immobili` ya es
correcto y **no se toca**.

<details>
<summary>Los 17, con lo que quedaría en cada uno</summary>

```
10052532  BRIGIDA D'AMICO        ["id"]      → ["9392"]
20069476  CORINNE BARRETTI       ["id"]      → ["13133"]
30070462  CLAUDIA FIGUCCIA       ["id","id"] → ["13077","13078","BZmpJJb3cK0UZGebkNIL",
                                               "GErtwRKYunLHEKkiL27m","Up4yqLaY7r5Eisl5fPX2"]
40059570  BENITO ALIERI          ["id","id"] → ["12774","12775"]
60062543  MICHELE SCIACCA        ["id"]      → ["12323"]
70063172  GIUSY ABRIGNANI        ["id"]      → ["11582"]
73jugTTUOQb3uXgrWUEL  ENZA OTTOVEGGIO        ["id"] → ["Y2pbQTmpdhPFRfDFpCWb"]
BLqmNhJGawZNPPVBoJoC  Walter Renda           ["id"] → ["9hqFw1AYQzckOzKCE6vh",
                                                       "guHEQTgWuniowAuC8vUG"]
G0TOsXb6sko0PEqmhpch  ANTONINO RAIA          ["id"] → ["5S4PIfdgra7BA9RneWLm"]
H7Nv04oktk5IisvQHYEK  GREGORIO SALADINO      ["id"] → ["Rr53qGQfNcHmiCk88dH6"]
LxSQlB2VvC5kXhpdWDU6  CRISTIAN CAMPANELLA    ["id"] → ["JfbEp0Omw64OtaFFN6W2",
                                                       "QbwIwFWnbWAMEjyB7rQ8",
                                                       "UsdDKl0FEatPNb24X5B9",
                                                       "WQvy0mDZaFE2M0StkebH",
                                                       "YGKyTZlfFBZpqcT0k5XJ"]
MQFIGE6OYkvay6kVEpSM  Paolo Pellegrino       ["id"] → ["TqDkvl8VbCcHF3ZGfU9f",
                                                       "dSTlb9TPupDoigGq6fvB"]
RgeIDi683cXoarXx5ccI  MATILDE VENTIMIGLIA    ["id"] → ["KBwSFf3TJNF7Y7oKVsPR"]
az7HY4KpQnVaZAhEFuq3  ANNALISA RAIA          ["id"] → ["Em6sUxyBVTMeO1qIM36J"]
i6vVJi78IDnpXqixWytv  DAVIDE D'AMICO         ["id"] → ["mmcfdANMDQWtOmLio5Gb"]
ppJgFQhXtfUHiv2Xnrlx  DIEGO TRIOLO           ["id"] → ["d2BfXJTAc7QtkEjrUtDo"]
sFfZag0BAI6mbDadkVAq  ANTONINO URSO          ["id"] → ["mdbGrSMCtYKhvHPRlnMw"]
```

</details>

### Cuatro más que aparecieron, y que NO se tocan

El recuento encontró 4 propietarios que **no están dañados** —su array tiene
IDs reales o está vacío, no relleno— pero tampoco cuadra con la relación
inversa:

```
197uPvalAweavG5yoWUY  ANTONINO SAMMARTANO   []  → debería ["T8dY6aI7SSeDBr4U5gV4"]
DSu8rS4EYg6QxdtTqRlm  BERNARDO DI BLASI     []  → debería ["ZPlJMQ21sIMQ47GlZY9M"]
Fs5G0rWYPWc57fXry7Rd  LUIGI VINCI           []  → debería ["dtu5euBMHUBBuETqLNaZ"]
1bbaQvjY7hIhY1Knmo7m  LAURA LICARI   ["vF7j…"] → debería ["WTVErRp18JUHG7M9XRoW","vF7j…"]
```

No son de este arreglo: son anteriores, de cuando los vínculos se escribían de
otra forma. **Por defecto no se tocan.** Si querés repararlos también, el
script acepta `--incluir-desincronizados`.

Mi recomendación: reparalos también, en la misma pasada. La reconstrucción es
igual de determinista y deja la colección entera coherente.

---

## Cómo ejecutarlo

Desde la raíz del proyecto, con el `.env.local` que ya tenés.

**Hacelo cuando no haya nadie trabajando en el CRM.** El script escribe la
lista entera de cada propietario, así que si un agente vincula un inmueble
justo en ese momento, su cambio podría perderse. El script se protege —vuelve
a leer cada ficha justo antes de escribirla y la salta si cambió— pero es más
simple no darle la ocasión.

**1. Recuento, que no escribe nada.** Corrolo aunque ya lo haya corrido yo: los
números tienen que salir de tu máquina.

```bash
node scripts/reparar-vinculos-propietarios.cjs
```

**2. Mirá la lista.** Cada propietario sale con lo que tiene ahora y lo que
quedaría. Si algo no te cuadra, pará.

**3. Reparar de verdad:**

```bash
node scripts/reparar-vinculos-propietarios.cjs --force
```

O, si querés incluir también los 4 desincronizados:

```bash
node scripts/reparar-vinculos-propietarios.cjs --force --incluir-desincronizados
```

Deja un registro en `scripts/volcados/reparacion-vinculos-<marca>.json` con el
antes y el después de cada ficha. **Se escribe tras cada ficha, no al final**,
así que si la conexión se cae a mitad, ahí queda exactamente lo que se llegó a
aplicar. Si fallan tres fichas seguidas, el script para solo.

**4. Volvé a correrlo sin `--force`.**

- Si reparaste con `--incluir-desincronizados`, tiene que decir **«Nada que
  reparar. Los vinculos estan bien.»**
- Si reparaste sin la bandera, dirá **«Nada DAÑADO que reparar. Quedan 4
  registros sin tocar»** y los listará. Es lo correcto: los 4 desincronizados
  siguen ahí a propósito.

**5. Comprobalo en el CRM.** Abrí la ficha de CLAUDIA FIGUCCIA o de CRISTIAN
CAMPANELLA (los dos de 5 inmuebles) y mirá la pestaña «Immobili».

---

## Detalles

- **Es idempotente.** Al terminar no queda nada dañado y relanzarlo no escribe.
- **Escribe un solo campo**, `immobili_collegati`, con `update()` y no con
  `set()`: `set` sin merge reemplazaría el documento entero.
- **No toca la colección `immobili`.** Solo la lee.
- **No toca `numero_immobili`.** Ya está bien en los 17; lo mantiene
  `recountProprietario` y el listado lo recalcula al pintar.
- **No deja arrays vacíos.** Si un propietario dañado no tuviera ni un
  inmueble, se salta y avisa, en vez de escribir `[]`. Hoy no hay ninguno.
- **Se frena solo** si `immobili_collegati` o `numero_immobili` han vuelto a
  entrar en `PROPRIETARI_ALLOWED`: reparar con la fuga abierta sería barrer con
  el grifo abierto, y encima daría la impresión de que está resuelto. Reconoce
  las tres formas de comilla, porque mirar solo una daría un «todo en orden»
  falso.
- **Se frena solo** si la lectura no cuadra con el recuento del servidor
  (`count()`). Es el fallo más peligroso que podría tener: una lectura corta
  reconstruiría vínculos incompletos, que es justo el daño que viene a
  reparar.
- **Se frena solo** si algún inmueble tiene `proprietarioId` y
  `proprietarioId_real` distintos. Hoy coinciden en los 870; si algún día no,
  cuál manda deja de ser evidente y no es el script quien debe decidirlo.
- **Sale con código 1** si alguna ficha falló, para que no parezca que fue bien.

---

## Cómo se revisó este script

Antes de dártelo lo pasé por una revisión adversarial: 5 revisores con
enfoques distintos (destrucción de datos, fidelidad de la reconstrucción,
idempotencia, salvaguardas y uso de Firestore) y 3 escépticos por hallazgo
intentando tumbarlo. 41 hallazgos en bruto, **5 sobrevivieron**, y los arreglé
todos:

1. Un fallo a mitad del bucle se llevaba por delante el registro en disco
   entero. Ahora se guarda tras cada ficha.
2. La comprobación de la fuga daba un falso «cerrada» si alguien reintroducía
   el campo con comillas dobles. El fichero está en CRLF y eso además rompía el
   filtrado de comentarios.
3. La pasada de verificación decía «los vínculos están bien» con 4
   desincronizados pendientes y sin nombrarlos.
4. El «ABORTADO» no distinguía entre no haber escrito nada y haberse caído a
   mitad.
5. Un `immobili_collegati` que existiera pero no fuera un array se contaba como
   «sin el campo» y desaparecía del informe.

Añadí además un sexto arreglo que los escépticos habían descartado por no poder
pasar con los datos de hoy: con `--incluir-desincronizados`, un propietario con
IDs reales en el array y sin inmuebles apuntándole habría recibido un `[]`
encima. Hoy no ocurre, pero la bandera es la que te recomiendo usar y el coste
de cubrirlo era cero.
