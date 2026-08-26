# Convenciones del proyecto

App personal de finanzas. Estas reglas salieron de errores concretos que ya
pasaron acá; cada una está para que no se repitan.

## Mobile primero, y se verifica midiendo

**Esta app se usa desde el celular.** Una pantalla que no entra en 375px es un
bug, no un detalle estético, y no se evalúa leyendo el CSS.

Antes de dar por terminada cualquier pantalla:

```bash
npm run dev                                    # en otra terminal
APP_PASSWORD=<tu-password> npm run check:responsive http://127.0.0.1:3000 / /gastos /historico /metas /proyeccion
```

El script (`scripts/responsive.mjs`) mide en un viewport de iPhone SE y falla si
encuentra scroll horizontal, texto por debajo de 11px efectivos, u objetivos
táctiles de menos de 32px.

Tres trampas que ya aparecieron y que revisando el código no se ven:

- **Texto dentro de un SVG.** Está en unidades del `viewBox`, así que se achica
  con el gráfico. Los ejes declarados a 10px quedaban en **4,8px reales** en un
  teléfono. Hay un `@media` que los sube a 24 unidades en pantallas chicas.
- **Texto largo en un flex.** Un comercio como `MERPAGO*SATTUCUMANDISTRIBUIDORA`
  estiraba la fila y generaba scroll horizontal en todo el sitio. Se resuelve con
  `min-width: 0` en el hijo que puede crecer.
- **Grillas de varias columnas.** La ecuación del cierre en 5 columnas no entra
  en 375px: se apila con un `@media`.

## La salida de un modelo es entrada no confiable

Nunca asumir que un campo vino. `data.consumos.length` sin chequear rompió el
guardado entero cuando el modelo omitió `consumos`, y `String(data.totalArs)`
escribió literalmente `"undefined"` en una columna numérica.

Todo lo que devuelve el modelo pasa por las funciones de `lib/guardar.ts`:
conversión de números tolerante al formato argentino, defaults en los textos,
fechas inválidas a `null` y períodos validados contra `YYYY-MM`.

## Credenciales de brokers

Van cifradas por `lib/boveda.ts`, atadas a su fila por AAD. Tres reglas que no
se negocian:

- **Nunca en una respuesta HTTP.** `listarConexiones()` devuelve un tipo sin el
  secreto; descifrar exige llamar a `leerCredencial()` a propósito. Si agregás un
  `select()` completo sobre `conexiones`, estás arrastrando el secreto cifrado a
  donde no va.
- **Nunca a un modelo de IA.** Ninguna función de extracción toca `conexiones`.
- **Nunca en un log o en `ultimo_error` sin censurar.** Un error de Binance trae
  la API key en el texto: pasarlo por `errorCensurado()` primero.

Y al mostrar una conexión, decir la verdad sobre qué la protege:
`lecturaGarantizadaPorLaPlataforma` distingue una credencial que **no puede**
operar aunque se filtre (Binance con key de solo lectura) de una que puede hacer
todo y solo está limitada por nuestro código (IOL, que usa usuario y contraseña
de la cuenta).

## Plata: determinista y con tests

Las proyecciones (`lib/proyeccion.ts`) son matemática financiera, **nunca un
modelo de lenguaje**: un LLM devuelve un número plausible y equivocado, y sobre
esto se toman decisiones reales. Los tests la contrastan contra la fórmula
cerrada de anualidad vencida. `npm test` antes de tocarla.

## Migraciones: se aplican a mano

No hay `drizzle-kit push` automático contra producción. Al cambiar el esquema:

1. `npx drizzle-kit generate --name <nombre>`
2. Pasarle el SQL a la persona para que lo pegue en el SQL Editor de Neon.
3. Las páginas que usen la tabla nueva tienen que degradar con
   `tablaFaltante()` y `<FaltaMigracion>`, no explotar con un digest opaco.

## Server y client components

`LineChart` recibe el formato **por nombre** (`formato="corto"`), no una función:
pasar una función de un server component a uno de cliente **compila sin quejas y
explota al renderizar**. Por lo mismo, los tipos compartidos viven en
`lib/tipos.ts` y no en los archivos de rutas.

Y el App Router no soporta dot notation (`<Typography.Title>`) dentro de un
server component: falla con "Element type is invalid".

## Que compile no es que funcione

Dos bugs serios llegaron a pasar el build. Antes de dar algo por hecho, levantar
el server y pedir la página de verdad. Cuando la página necesita base de datos y
no hay, alcanza con una ruta temporal que renderice los componentes reales con
datos de prueba, y borrarla después.

## Gráficos

La paleta de series está **validada con el script de la skill de dataviz** contra
el fondo papel. El orden ámbar → azul → verde es funcional: con ámbar y verde
adyacentes el par cae a ΔE 6,1 bajo daltonismo protán y deja de distinguirse.
**No reordenar sin volver a validar.**

## Datos personales

`lib/pii.ts` redacta antes de mandar texto al modelo y antes de guardar lo que
devuelve. En PDFs e imágenes **no es posible** y no se pretende lo contrario: el
modelo tiene que leer el documento.

El riesgo de esa función no es dejar pasar un dato, es **sobre-censurar**: un DNI
son 7-8 dígitos y un importe también. Todo lo ambiguo se ancla a su etiqueta.

## Idioma

Código, comentarios, commits e interfaz en castellano rioplatense.
