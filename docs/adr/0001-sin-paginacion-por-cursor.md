# ADR 0001 — El listado de inmuebles no usa paginación por cursor

- **Estado**: aceptado
- **Fecha**: 2026-09-20
- **Decide**: no implementar paginación por cursor en `/immobili` ni en `/clienti`
- **Revisar cuando**: `immobili` supere los ~5.000 documentos

---

## Contexto

El plan maestro incluía «paginación por cursor» como tarea de optimización, con
el razonamiento de que traer el catálogo entero en cada carga era caro y que la
lista pintaba cientos de tarjetas de golpe.

Antes de implementarla se midió contra producción. **La premisa era falsa en sus
tres puntos.**

| supuesto del plan | medición real |
|---|---|
| la lista pinta ~870 tarjetas en el DOM | pinta **15**: `PropertyGrid` recorta con `slice(0, visibleCount)` y cada tarjeta lleva `content-visibility: auto` |
| el coste de Firestore es alto | **631 lecturas por carga**, del orden de 0,0004 USD — unos 2-3 USD al mes con seis agentes |
| paginar es una optimización acotada | de los **23 filtros, 21 se aplican en memoria** en el navegador, y la búsqueda de texto se resuelve en memoria **en el propio servidor** |

## Decisión

Se mantiene el modelo actual: **traer el conjunto que corresponde a la vista,
filtrar en el cliente y paginar visualmente de 15 en 15.**

Es lo correcto a este tamaño, y es justo lo que hace que 21 filtros respondan al
instante y sin tocar la red.

## Por qué se descartó cada alternativa

### (a) Cursor puro en el servidor — rechazada

Dos razones independientes, y cualquiera de las dos basta.

**No se puede recortar antes de filtrar.** Pides 20 documentos, aplicas en el
cliente zona + precio + habitaciones y te quedan 3. Peor aún: la búsqueda `q=`
se resuelve en memoria **dentro del servidor**, después de la consulta
(`src/app/api/immobili/route.ts`), así que ni el servidor puede recortar antes
de filtrar. Está documentado con tests en `src/lib/immobili/list-limits.ts`.

**No hay clave de cursor estable.** `DatiBase.Codice` está declarado como
`string`; el servidor ordena `orderBy('DatiBase.Codice', 'desc')`, o sea
lexicográficamente, y el cliente **reordena numéricamente** al recibir
(`src/hooks/useImmobili.ts`, «defensive sort»). Hoy el desajuste es invisible
porque llega el catálogo completo. Con cursor, la paginación iría en orden de
índice y la pantalla pintaría otro orden: tarjetas que saltan de página,
duplicados y huecos. Arreglarlo exige normalizar `Codice` a número en los 870
documentos y en el contador de altas: eso es un backfill, no una refactorización.

### (b) Empujar los filtros de igualdad a Firestore — rechazada

La aritmética de subconjuntos: 6 contextos de estado/tipo × (2^k − 1)
combinaciones. Con k = 4 (solo los cuatro desplegables) son **90 índices
compuestos nuevos** sobre los 8 que hay; con k = 13, **49.146**. El límite duro
de Firestore es **200 por base de datos**, así que la segunda cifra lo supera por
un factor de 245.

El *index merging* no salva el cálculo: fusiona igualdades pero devuelve el
resultado en orden de `__name__`, así que en cuanto se añade
`orderBy('DatiBase.Codice', 'desc')` vuelve a exigir el compuesto.

Y **los filtros de rango ni siquiera son empujables**: `PrezzoVendita`,
`PrezzoAffitto`, `MetriCommerciali`, `CamereLetto`, `Bagni` y `Piano` están
declarados `number | string` en `src/types/property.ts`, y hay valores guardados
de las dos formas. Firestore ordena **primero por tipo**, así que un
`where('DettagliFisici.CamereLetto', '>=', 2)` descartaría en silencio todos los
documentos que guarden el valor como cadena — que son la mayoría. El cliente no
tiene ese problema porque coacciona con `Number()`.

### (c) Motor externo (Typesense / Meilisearch / Algolia) — rechazada **hoy**

Es lo único que resuelve de verdad subcadena + facetas arbitrarias + paginación.
Pero con 870 inmuebles y 453 clientes es un segundo almacén que sincronizar para
un problema que no se tiene.

**Este es el camino correcto cuando llegue el momento, y el momento no es
«cuando moleste» sino un umbral concreto: cuando `immobili` pase de ~5.000
documentos.** A partir de ahí, traer el conjunto completo deja de ser razonable
y la respuesta es (c), no (a).

### (d) Virtualizar la lista — rechazada por innecesaria

No hay librería de virtualización en `package.json`, y no hace falta:
`PropertyGrid` ya recorta a 15 (`useImmobiliFilters`), cada tarjeta lleva
`content-visibility: auto` con `contain-intrinsic-size`, `PropertyCard` y
`PropertyGrid` son `memo` y los callbacks van en `useCallback`. Nunca ha habido
870 tarjetas en el DOM. `/clienti` hace lo mismo con 30.

### (e) No tocar la arquitectura — **aceptada**

La paginación por cursor ahorraría unos 2 USD al mes a cambio de romper 21
filtros y el orden de la lista.

## Lo que sí se hizo en su lugar

El cuello de botella real no era el volumen de la carga inicial, sino que
**cualquier acción sobre una tarjeta redescargaba el catálogo entero**:
`refresh()` ponía `isValidating` a true, la rejilla lo leía como transición de
filtro y sustituía la lista por esqueleto mientras releía los 631 documentos.

Se sustituyó por mutación local sobre la caché de SWR con `revalidate: false`
(`src/lib/immobili/mutacion-local.ts`). Suspender un inmueble, borrarlo,
guardar la ficha o subir fotos ya no cuesta ni una lectura ni un parpadeo.

## Consecuencias

- El listado sigue trayendo el conjunto de la vista en una sola petición.
- Los 23 filtros siguen siendo instantáneos y sin red.
- El coste de Firestore se mantiene en el orden de unos pocos euros al mes.
- **Queda pendiente de vigilancia el tamaño de `immobili`.** Al superar los
  ~5.000 documentos hay que reabrir esta decisión, y la respuesta esperada es
  (c), un motor de búsqueda externo, no (a).

## Cómo reproducir las mediciones

```bash
node scripts/auditar-filtros.cjs      # los 12 filtros contra los datos reales
node scripts/verificar-sospeso.cjs    # recuentos del catálogo, solo lectura
```
