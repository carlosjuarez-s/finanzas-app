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

## Importar operaciones

Una operacion importada mal es peor que una que falta: arrastra el promedio
ponderado de todo el activo y no hay nada en la pantalla que lo indique. Dos
reglas de ahi:

- **Solo entra lo que ya esta en dolares.** Una compra de ETH contra BTC tiene
  el precio expresado en BTC. Guardarla como si fueran dolares no da un numero
  aproximado, da uno absurdo. Se omite, se cuenta y se dice cual y por que.
- **La comision en otra moneda es cero, no el numero crudo.** Binance cobra en
  BNB si tenes el descuento activado; sumar BNB a un costo en dolares es sumar
  peras con manzanas.

La identidad de una operacion importada es su `refExterna`, y **nunca se borra**:
es lo unico que evita duplicar el historial al reimportar. Con id de la
plataforma (`BINANCE:<par>:<id>`) dos compras identicas del mismo dia son dos
operaciones distintas; sin id se cae a un hash del contenido y colapsan en una,
que es el precio de no tener id. Corregir a mano cambia `origen` pero conserva
la ref: la correccion ya esta protegida por el `onConflictDoNothing` del
importador.

Y los simbolos se descomponen con `exchangeInfo`, no partiendo el string:
"ETHBTC" se puede leer ETH/BTC o ETHB/TC, y adivinar por prefijos falla con los
activos nuevos.

## Quien entra a la app

Dos puertas, nunca las dos a la vez: si `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`
estan, se entra con Google; si no, queda el Basic Auth de `APP_PASSWORD`. Que la
puerta vieja siga abierta cuando la nueva funciona seria un agujero, no un
respaldo.

Auth.js **no** restringe por email: agregar el proveedor de Google y nada mas
deja entrar a cualquiera con cuenta de Google. La lista blanca es nuestra
(`lib/auth.ts`) y se aplica en dos lados a proposito:

- En el callback `signIn`, que decide si se crea la sesion. Ahi ademas se exige
  `email_verified` de Google: sin eso el email es un dato que el proveedor no
  confirmo.
- En el middleware, en **cada** request. Sacar un email de `AUTH_EMAILS` tiene
  que echarlo en el siguiente request, no cuando venza su token dentro de 30
  dias.

`AUTH_EMAILS` vacia niega a todos. Es deliberado: una variable de entorno que se
olvidaron de setear no puede terminar significando "que entre cualquiera".

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

**IOL esta en pausa por decision del usuario** (agosto 2026): no implementar la
integracion hasta que la pida explicitamente. El motivo es el de arriba —su API
pide las credenciales con las que se opera la cuenta— y mientras tanto IOL entra
por CSV, que no obliga a guardar nada. Binance queda como la unica plataforma
conectada por API.

Y al mostrar una conexión, decir la verdad sobre qué la protege:
`lecturaGarantizadaPorLaPlataforma` distingue una credencial que **no puede**
operar aunque se filtre (Binance con key de solo lectura) de una que puede hacer
todo y solo está limitada por nuestro código (IOL, que usa usuario y contraseña
de la cuenta).

## Costo de entrada y ganancia

`lib/costo.ts` es determinista y está cubierto por tests. Tres reglas que salieron
de bugs reales del dominio:

- **La unidad es el dólar.** Medir en pesos da la respuesta opuesta: un activo
  puede subir 50% en pesos y ser pérdida en poder de compra. Cada transacción
  guarda el tipo de cambio de **su** día; convertir todo al dólar de hoy borra
  justo el efecto que se quiere medir.
- **Los ratios de CEDEAR cambian.** Cuando pasa, la cantidad se multiplica y el
  precio unitario baja igual. Si el costo no se ajusta por el factor, aparece una
  pérdida enorme que nunca ocurrió. Se modela como evento del activo, no como
  operación.
- **Ante una cantidad que no cierra, avisar y no calcular.** `discrepancias()`
  detecta que el broker informa más unidades que el libro y sugiere el factor. Es
  preferible decir «acá pasó algo que no entiendo» a mostrar con confianza un
  número inventado.

## El modelo no calcula

Vale para las proyecciones, para el costo de entrada y para el análisis. La
división es siempre la misma: **el código calcula, el modelo explica**.

`lib/auditoria.ts` detecta los huecos y las inconsistencias; el modelo recibe esos
hallazgos ya hechos y los prioriza. Si algún día se invierte ese orden, la app
empieza a afirmar cosas plausibles y falsas con total seguridad, y nadie lo nota
leyendo la respuesta.

Al modelo van agregados, nunca filas crudas, y siempre por `redactarProfundo()`.

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
