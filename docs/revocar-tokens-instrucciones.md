# Revocar los tokens públicos — instrucciones para Leandro

**Esto lo ejecutás vos.** Yo dejé el script y el recuento; no lo corrí contra producción.

---

## Qué problema cierra

`/api/upload` estampaba un `firebaseStorageDownloadTokens` en cada fichero que
subía. Ese token es el mecanismo de «cualquiera con el enlace» de Firebase:

- **no** pasa por `storage.rules`
- **no** caduca
- **no** lo corta bloquear al usuario, ni degradarlo, ni cerrar su sesión, ni
  rotar `SESSION_SECRET`

Durante la auditoría lo comprobé con un `curl` sin ninguna credencial: un folio
de visita firmado respondió `HTTP 200`, `application/pdf`, 35.971 bytes.

El código ya está arreglado (`08e369e`, 19 de septiembre): desde entonces solo
las fotos reciben token. **Lo que sigue expuesto es lo que se subió antes**, y
eso solo se cierra tocando el metadato de cada objeto. De ahí este script.

---

## Qué dijo el recuento (dry-run, 21 de septiembre)

Bucket `crm-pantaleo-propio.firebasestorage.app` — **5.058 objetos**.

| prefijo | total | públicos | privados | tipos |
|---|---:|---:|---:|---|
| `immobili/` | 4.295 | 4.295 | 0 | image/webp, image/jpeg, image/png |
| `propiedades_fotos/` | 443 | 443 | 0 | image/jpeg |
| `documenti_generati/` | 320 | 0 | **320** | application/pdf |

**Se revocarían 320 objetos**, todos PDF de `documenti_generati/`: folios de
visita firmados y contratos. **Las 4.738 fotos no se tocan.**

### Dos correcciones sobre lo que decía el informe de auditoría

1. **Son 320, no 421.** El informe hablaba de ~320 en `documenti_generati` más
   ~101 en `immobili/*/documenti`. En el bucket **no existe ni un objeto** bajo
   `immobili/*/documenti/`: los 4.295 de `immobili/` son fotos. La cifra real
   de documentos expuestos es 320.

2. **`propiedades_fotos/` estuvo a punto de revocarse por error.** El primer
   recuento lo clasificó como «documento privado» porque `esRutaPublica` no lo
   reconocía: el guion bajo impide que `/^propiedades\//` lo capture. Son 443
   fotos de 110 inmuebles vivos. Revocarlas habría dejado la galería en blanco
   en el CRM y en Idealista. Arreglado en `7e53292`, con un test que cae si
   alguien revierte la línea.

---

## Antes de ejecutar

**Esto no se deshace.** Un token revocado no se restaura: Firebase puede emitir
uno nuevo, pero sería otro, con otra URL.

> **Cualquier enlace que se haya compartido por fuera —con un cliente, con un
> notario, por WhatsApp— dejará de funcionar para siempre.**

Dentro del CRM no se nota nada: desde `0b6fdda` la interfaz pide esos
documentos por `/api/files`, que los lee con el Admin SDK y solo exige sesión.
El script se niega a arrancar si esa parte no está.

---

## Cómo ejecutarlo

Desde la raíz del proyecto, con el `.env.local` que ya tenés.

**1. Recuento, que no toca nada.** Corrolo aunque ya lo haya corrido yo: los
números tienen que salir de tu máquina.

```bash
node scripts/revocar-tokens-publicos.cjs
```

**2. Mirá la tabla del censo.** Es la comprobación que importa:

> Si un prefijo de **fotos** aparece con «privados» distinto de cero, **pará**.
> Son fotos que se despublicarían.

Con los datos de hoy, la columna «privados» solo puede tener `documenti_generati/`.

**3. Comprobá el bucket de la cabecera.** Tiene que decir
`crm-pantaleo-propio.firebasestorage.app`. Si dice otra cosa, pará.

**4. Si los números cuadran, revocá:**

```bash
node scripts/revocar-tokens-publicos.cjs --ejecutar
```

Deja un registro en `scripts/volcados/revocacion-<marca-de-tiempo>.json` con
cada ruta tocada.

**5. Comprobá en el CRM.** Abrí un folio de visita firmado desde `/documenti`.
Tiene que abrirse igual: ahora va por `/api/files`.

**6. Opcional, para verlo con tus ojos.** Agarrá una URL
`firebasestorage.googleapis.com/...documenti_generati...` de antes y pedila en
una ventana de incógnito. Antes daba el PDF; ahora tiene que dar 403.

---

## Detalles

- **Es idempotente.** Un objeto sin token se salta. Relanzarlo no hace nada.
- **No borra ficheros.**
- **No escribe en Firestore.** Las URLs guardadas se quedan como están: son un
  dato de negocio. La interfaz ya no depende de ellas porque `urlDeDescarga`
  traduce al pintar.
- **Se frena solo** si su lista de rutas públicas no coincide con la de
  `src/lib/storage-urls.ts`, si la interfaz todavía enlaza URLs públicas en
  crudo, o si no encuentra el bucket.

---

## Un aviso aparte: `FIREBASE_STORAGE_BUCKET`

En tu `.env.local`, esa variable **apunta a un bucket que no existe**. El
script lo detecta y cae al correcto, avisando.

En producción no está fallando —las fotos se ven, las subidas funcionan— así
que el valor de Vercel debe ser el bueno o no estar puesto. Pero conviene
alinear el de local, porque `/api/upload` y `/api/files` usan esa misma
expresión: si algún día alguien copia el `.env.local` a Vercel, las subidas
empiezan a fallar.
