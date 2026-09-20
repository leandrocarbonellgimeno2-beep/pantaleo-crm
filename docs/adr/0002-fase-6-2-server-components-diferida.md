# ADR 0002 — La migración a Server Components queda diferida

- **Estado**: aceptado
- **Fecha**: 2026-09-20
- **Decide**: no acometer ahora la Fase 6.2 del plan maestro
- **Cuando se acometa**: en rama propia, nunca directamente sobre `master`

---

## Contexto

El plan maestro incluye una Fase 6.2: «cero Server Components, cero Suspense».
El árbol de la aplicación es **100 % cliente** —40 ficheros con `"use client"`
sobre 11 páginas— y todos los datos llegan por SWR *después* de la hidratación,
así que el servidor no aporta nada al primer pintado.

El diagnóstico sigue siendo correcto. Lo que ha cambiado es la urgencia:
producción va estable y rápida. Durante los últimos bucles se cerraron las
causas reales de lentitud percibida, que no eran arquitectónicas:

- el listado dejó de escanear la colección entera (filtro en Firestore);
- las acciones sobre una tarjeta dejaron de redescargar el catálogo
  (mutación local sobre la caché de SWR, [ADR 0001](./0001-sin-paginacion-por-cursor.md));
- `react-dropzone` salió del arranque de `/immobili`;
- el optimizador de imágenes quedó activado.

## Decisión

**La Fase 6.2 se difiere a propósito.** No es deuda olvidada: es una mejora
real que no compensa el riesgo *ahora mismo*, con el CRM en uso diario y el
resto del backlog cerrado.

## Por qué no ahora

Es un **rediseño**, no una optimización acotada. Tocar `"use client"` en 40
ficheros cambia dónde se ejecuta cada componente, y con ello:

- **la sesión**: hoy la identidad viaja en una cookie que leen las rutas de API;
  un componente de servidor la lee de otra forma;
- **los hooks de datos**: `useSWR`, `useImmobili`, `useClienti` y compañía no
  existen en el servidor, así que cada pantalla migrada necesita una forma
  nueva de cargar;
- **los contextos**: `AuthContext` y `ConfirmProvider` envuelven la aplicación
  entera y son de cliente por definición;
- **el estado compartido**: la mutación local del catálogo que se acaba de
  introducir vive en la caché de SWR del cliente.

Nada de eso es imposible, pero ninguno se prueba con tests unitarios: se prueba
usando la aplicación. Y el modo de fallo típico de esta migración —una pantalla
que hidrata mal y se queda a medias— no lo caza `tsc` ni `next build`.

## Cómo hacerlo cuando se haga

**Nunca directamente sobre `master`.** Esta es la parte operativa de la
decisión y es la que importa:

1. **Rama propia**, `feat/server-components`. El CI de este repositorio corre
   con `on: push` sin filtro de rama, así que cada empujón a esa rama pasa
   igualmente por `tsc --noEmit`, `npm test` y `npm run build`.

2. **Preview de Vercel antes de integrar.** Las previsualizaciones dependen de
   que la integración Vercel-GitHub esté activa para ramas distintas de la de
   producción; conviene confirmarlo en el panel de Vercel antes de empezar, no
   después. `vercel.json` aquí solo declara el cron de purga, y el despliegue
   programado de `deploy.yml` apunta a producción mediante un Deploy Hook: **ni
   uno ni otro sirven para previsualizar una rama.**

3. **Una pantalla por vez, y empezando por la más pequeña.** Migrar las 11
   páginas de golpe hace imposible saber cuál rompió qué. El orden sensato es
   por riesgo creciente: primero una pantalla de solo lectura, y dejar
   `/immobili` para el final, que es la que concentra los modales apilados, la
   mutación local y el visor de fotos.

4. **Recorrido manual antes de integrar**, con sesión iniciada: ficha de un
   inmueble, ficha de un cliente, una cita y un documento con firma. Es la
   comprobación que ninguna herramienta automática cubre, y la única que
   detecta una hidratación rota.

5. **Integrar solo con el preview verde**, y con la rama al día respecto a
   `master`.

## Consecuencias

- El primer pintado sigue dependiendo de la hidratación. Es el coste aceptado.
- El backlog del plan maestro queda cerrado salvo esta fase.
- Si alguien retoma el plan y ve la Fase 6.2 pendiente: **no está olvidada, está
  aplazada, y este documento dice cómo acometerla sin romper producción.**
