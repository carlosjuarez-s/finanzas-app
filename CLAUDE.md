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

## Plata en dos monedas

Un sueldo partido —parte en dolares, parte en pesos— rompe la idea de que un
total dice algo solo. Consolidar es elegir un tipo de cambio, y **el tipo de
cambio de un mes es el de ese mes**: mirar agosto del año pasado con el dolar de
hoy no da un numero aproximado, da uno absurdo.

Por eso `monthly_closes` guarda `tipo_cambio` y esa cifra queda **congelada** al
cerrar. Del mes en curso se usa el MEP de hoy, y se dice que es de hoy.

Se guardan las partes crudas (`ingreso_ars` + `ingreso_usd`), nunca el total ya
sumado: si el tipo de cambio de un mes estaba mal cargado, alcanza con
corregirlo y todo se recalcula.

Cuando hay dolares y **no** hay tipo de cambio, el total es `null`, no la parte
en pesos sola. Mostrar 300.000 cuando ademas hay USD 1.000 sin convertir es peor
que mostrar "—": el numero parece completo y no lo esta.

## El sueldo se puede cargar a mano

El neto entraba **solo** por el recibo, y el clasificador solo lee la parte en
pesos: un recibo argentino liquida en pesos y la parte en dolares se cobra por
fuera. Con eso, quien cobra partido no podia cargar su ingreso real, y sin
ingreso no hay tasa de ahorro ni estimacion del mes que viene.

`PUT /api/sueldo` carga las dos partes. El `file_id` es `manual:<periodo>`,
que no puede chocar con un id de Drive ni con el `upload:<hash>` de un archivo
subido, y la fila queda con `corregido = true`.

**Esa marca es la que protege el dato.** El upsert de `guardarSalary` lleva
`setWhere: eq(salaries.corregido, false)`: el sync de Drive vuelve a leer el
recibo todos los dias, y sin eso escribiria el neto en pesos solo, borrando la
parte en dolares. Lo que escribio una persona mirando su banco le gana a lo que
dedujo un modelo mirando un PDF.

Hay **una sola puerta** para editar el sueldo. La rama `entidad: 'sueldo'` de
`/api/rectificar` se elimino: solo escribia pesos, asi que corregir por ahi
borraba los dolares.

El formulario no tiene campo libre de fecha. Ofrece los dos meses que el cierre
mira —el del mes y el anterior, porque el sueldo de un mes paga la tarjeta del
siguiente— y nada mas: cargar el sueldo en un mes que ningun cierre lee es
escribir un dato que despues no aparece.

## Un gasto fijo declarado le gana a uno inferido

La estimacion adivinaba los gastos fijos: llamaba "recurrente" a la categoria
que aparecia en la mitad de los meses. Eso falla en las tres cosas que mas
importan, y ninguna se arregla mirando mas historico:

- **Cuando aumenta.** Un alquiler argentino sube por contrato cada seis meses,
  y la mediana de los ultimos seis meses es el precio VIEJO.
- **Cada cuanto cae.** Un seguro semestral aparece en dos meses de doce y queda
  clasificado como gasto variable.
- **Cuando termina.** Un gimnasio dado de baja sigue estimandose meses despues,
  hasta que sale del promedio.

`recurrentes` guarda esas tres como datos. La estimacion pasa a tener cuatro
baldes, ordenados por cuanto se les puede creer: **comprometido** (cuotas
firmadas), **fijo** (lo que declaraste), **recurrente** (lo que aparenta
repetirse) y **variable**.

Dos reglas que sostienen el numero:

- **Lo declarado se RESTA del historico**, no lo reemplaza. El alquiler
  declarado tambien esta adentro de la categoria "Alquiler" de los meses que ya
  pasaron: sumarlo entero lo contaria dos veces. Y se resta en vez de descartar
  la categoria, porque tener un alquiler declarado no significa que "Alquiler"
  no tenga nada mas.
- **Los aumentos se componen.** Dos del 10% son 21%, no 20%. Y el primer ajuste
  cae DESPUES del primer periodo: el mes en que empezas a pagar algo pagas el
  precio de entrada.

El aumento es opcional y de dos formas, nunca las dos juntas: un **% fijo** cada
N meses, o atado a un **indice**. Los indices los carga la persona a mano
(`settings.indices`): **la app no sale a buscar el IPC a ningun lado**, y si a
un indice le falta la variacion de un mes no se inventa — se ajusta con lo que
hay y se avisa que el monto quedo por debajo. Un alquiler estimado con un IPC a
medias es peor que uno sin ajustar, porque el error no se ve.

El cuarto color del grafico apilado entro validado con
`dataviz/scripts/validate_palette.js`, no elegido a ojo.

## No todo lo que entra es sueldo

`salaries` era el unico ingreso, y eso dejaba afuera plata que entra de verdad:
la ganancia de una inversion, lo que alguien te devuelve, un extra. Sin lugar
donde ponerlas, esos meses mostraban una tasa de ahorro peor que la real —en la
planilla importada eran el **13% de todo lo que entro**.

`ingresos` es una tabla aparte, no una fila mas en `salaries`: un sueldo es uno
por mes y tiene periodo unico; de esto puede haber varios. Y aparte de un
`gasto` con monto negativo, que fue el parche de la primera version del import:
un gasto negativo ensucia el desglose por categoria y aparece en "falta pagar".

Tres tipos, y la distincion **no es cosmetica**:

- `GANANCIA` — rindio una inversion. Plata nueva.
- `REINTEGRO` — te devolvieron algo que vos pusiste. **No es plata nueva**: es
  la misma plata volviendo. Contarla como rendimiento hace parecer que la
  inversion rindio el doble.
- `EXTRA` — el comodin.

Los tres suman al ingreso del mes. Solo `GANANCIA` cuenta como rendimiento, y
por eso el cierre expone `gananciaArs` aparte de `extraArs`.

## Importar una planilla hecha a mano

`lib/planilla.ts` traduce la hoja "Finanzas" al modelo de la app. Las reglas que
lo hacen confiable, y que valen para cualquier import futuro:

- **No inventa un numero.** Lo que corrige queda en `rectificaciones`, lo que no
  puede traducir queda en `descartes` con el motivo. Las dos listas se muestran.
- **La heuristica se verifica antes de usarse.** El año no esta en la planilla y
  se infiere ("un Enero detras de un Diciembre es un año nuevo"), pero
  `verificar()` lo contrasta contra los vencimientos que si traen año y contra
  el mes en curso. Si alguna ancla no cierra, el import **se detiene**: escribir
  tres años de datos corridos es peor que no escribir nada.
- **Lo ambiguo se pregunta, no se elige.** Un "Ingreso" con monto negativo puede
  ser plata que entro o que salio, y la diferencia es del doble del monto: se
  descarta con el motivo.
- **Un mes cargado dos veces se detecta por el sueldo.** Una persona cobra un
  sueldo por mes: dos filas "Salario" en un periodo son un bloque duplicado.
  Sumarlos da un mes con el doble de todo que corre el promedio de los demas.
- **El SQL es idempotente.** Cada fila lleva un `file_id` derivado del contenido
  y va con `ON CONFLICT DO NOTHING` contra los unicos que ya existen. Correrlo
  dos veces no duplica una fila, y lo que ya estaba gana.

Se verifica de verdad: `initdb` local, las diez migraciones, el import, y de
nuevo el import para probar que no duplica. La suma reconcilia contra el total
de la planilla al peso.

**Los cierres no se importan, se calculan.** Cuando los datos entran por afuera
de la app no hay nada que dispare el recalculo: por eso existe
`POST /api/recalcular`, y el boton en Historico.

## Es una app argentina

No es una app de finanzas que ademas soporta Argentina: **es argentina**, y
recien despues, tal vez, otra cosa. Eso decide cosas concretas y no hay que
volver a discutirlas:

- El peso es la moneda en la que se consolida todo. El dolar es la **segunda
  moneda de un argentino**, no una moneda generica: por eso hay dos columnas y
  no una tabla de monedas.
- Los formatos son es-AR (1.350.000,00), y los montos se escriben con puntos de
  miles tambien en los campos de carga.
- La percepcion RG 5617 del 30%, el CFT de las cuotas y los ratios de CEDEAR
  estan tejidos en la logica, no en las etiquetas.

Generalizar esto a otros paises no es agregar un selector de moneda: es otro
proyecto. Hasta que alguien lo pida, la respuesta a "¿y si el usuario es de
otro lado?" es **todavia no**.

## Un prestamo puede estar en dolares

El campo se llama `cuota_ars` por historia: nacio cuando todos los creditos
eran en pesos. Hoy `prestamos.moneda` puede ser USD, y entonces ese numero son
dolares. Sumarlo crudo al gasto en pesos metia una cuota de USD 200 como 200
pesos — mil quinientas veces menos de lo que sale.

`totalDelMes()` devuelve `{ ars, usd }`, no un numero. El cierre suma cada
parte donde corresponde, y la categoria "Cuotas" del desglose entra convertida
al tipo de cambio del mes (o no entra, si no hay con que convertir). En la
pantalla, cada prestamo se muestra **en su propia moneda**: `fmtDe(p.moneda)`.

## El total de un cierre se deriva, no se lee

`monthly_closes` guarda **las partes**: `ingreso_ars`, `ingreso_usd`, y el
`tipo_cambio` con el que se cerro el mes. El total no esta guardado. Leer
`ingreso_ars` como si fuera el ingreso del mes es un bug, y estuvo en cinco
lugares a la vez: historico, proyeccion, metas, el analisis con IA y el MCP.

Para quien cobra 70% en dolares eso mostraba menos de un tercio de lo que gana.
Peor: `ahorro_ars` **si** esta consolidado, asi que en el mismo grafico la linea
de ahorro quedaba por encima de la de ingreso.

Se deriva con `cierresEnPesos()` (o `totalesDelCierre()` para una fila sola).
Un mes con dolares y sin tipo de cambio **no entra**: se devuelve aparte en
`sinTipoCambio`, la pagina lo dice y la auditoria lo marca. Nunca cuenta como
cero — un mes del que no se sabe cuanto vale no vale cero, y un cero inventado
hunde el promedio de todos los demas.

## Pagado y pendiente

Cargar un gasto y pagarlo son dos momentos distintos. Pero lo pendiente **no
cambia el cierre**: el gasto ya esta imputado al mes lo hayas pagado o no. Lo que
cambia es tu caja. Confundirlos haria que pagar tarde parezca gastar menos, y la
pantalla lo aclara para que nadie lo lea al reves.

## Estimar no es cerrar

`lib/estimacion.ts` calcula el mes que viene **al vuelo** y no escribe nada. Si
se guardara en `monthly_closes`, contaminaria los promedios que alimentan la
proxima estimacion: el error se realimenta y crece solo.

Se arma de tres pedazos con confianza muy distinta, y por eso se reportan
separados: **comprometido** (cuotas ya firmadas, no es prediccion),
**recurrente** (aparece en la mitad o mas de los meses) y **variable** (el
resto). Cada categoria sale de la **mediana**, no del promedio: un mes con un
gasto raro corre el promedio y no la mediana.

La categoria `Cuotas` del historico se **excluye** del calculo por categoria,
porque las cuotas ya entran por el lado de los prestamos. Es la mas facil de
contar dos veces.

## Comprar en cuotas es un prestamo

Una compra en cuotas tiene exactamente la forma de un credito: cuantas cuotas,
de cuanto, desde cuando. Va a la tabla `prestamos`, no a `gastos`, y no hay tabla
paralela. Guardarla como un gasto puntual hundiria el mes de la compra y dejaria
los meses siguientes sin la cuota que si se va a pagar.

El clasificador de texto libre devuelve `tipo: "CUOTAS"` cuando detecta que el
pago se reparte, aunque se mencione el precio total.

## Como se llaman los numeros

Una etiqueta que no describe lo que el numero contiene manda a buscar la
diferencia al lugar equivocado. La celda del cierre decia "Tarjetas" y traia los
resumenes **mas** los gastos sueltos **mas** la cuota de los prestamos: dice
"Gastos". Cuando cambie que entra en un total, revisar como se llama.

## Percepciones RG 4815 / 5617

La alicuota vive en `lib/impuestos.ts`, no adentro de un JSX: en Argentina esto
cambia por resolucion y tiene que haber un solo lugar que tocar.

Lo importante para quien lo lee no es cuanto le cobraron: es que hay **dos**
salidas y no son equivalentes. Evitarla —cancelando el consumo en moneda
extranjera con dolares propios, que es plata que nunca sale del bolsillo— y
recuperarla ante ARCA, que vuelve mucho despues y en pesos que para entonces
valen menos. La pantalla dice las dos, en ese orden.

Lo percibido **es** lo que se habria ahorrado, asi que no hay funcion que lo
"calcule": seria devolver el mismo numero. El monto se muestra una sola vez;
repetirlo en dos filas se lee como un error de calculo.

## El portafolio creció, ¿pero por que?

Un total mes a mes no dice si invertiste bien, y es el error clasico de todo
tracker: si un mes aportaste USD 1.000 y el mercado cayo, el total igual sube y
el grafico dice que te fue bien.

**Creciste porque pusiste plata** y **creciste porque lo que tenias subio** son
dos cosas distintas, y solo la segunda mide algo. Por eso el historico lleva dos
lineas —valor y aportado— y la distancia entre ellas es el resultado.

`rendimiento = cambio − aportes` es una aproximacion: trata todos los aportes
como si hubieran entrado al principio del tramo. Responde "¿subio porque puse
plata o porque rindio?", que es la pregunta real; no sirve para comparar contra
un indice.

Una operacion en pesos sin el dolar de su dia queda **afuera** del aportado y se
cuenta aparte. Convertirla al dolar de hoy diria que compraste mucho mas barato
de lo que compraste.

## Categorias: son del usuario, no del codigo

Estaban fijas en `lib/prompts.ts`, en rioplatense y con los rubros de una
persona. Ahora viven en `settings` por usuario, y **los prompts son funciones
que reciben la lista**: decirle al modelo que elija entre categorias que esa
persona no usa produce exactamente las clasificaciones que despues hay que
corregir a mano.

En `settings` y no en una tabla propia porque una categoria no tiene mas
atributos que su nombre, y los gastos ya la guardan como texto. Renombrarla no
rompe nada — deja de agrupar lo viejo con lo nuevo, y la pantalla lo dice.

`encajar()` compara sin mayusculas y sin acentos: "Educación" y "Educacion" son
la misma, y mandarlas separadas partiria el gasto en dos columnas del grafico.
`Otros` no se puede borrar: es donde cae lo que el modelo no supo clasificar.

## Estado en la forma, no solo en el color

Un monto negativo se distinguia solo por ser ocre. Quien no distingue ocre de
gris veia el mismo numero.

`<Monto>` pone **tres señales**: la flecha, el signo explicito —el `+` tambien,
que es el que se omite por costumbre— y el color. El color refuerza; ya no es
lo unico que lo dice. Lo mismo en los primeros pasos: tilde ademas de tachado,
no solo verde.

Cuando agregues estado nuevo, preguntate si se distingue en blanco y negro.

## Navegacion: barra lateral arriba de 980px

El nav de arriba se lleva tres renglones antes de que empiece el contenido, y
en un monitor esos renglones son la parte mas valiosa de la pantalla. A partir
de 980px pasa a una barra fija a la izquierda: la columna de contenido ya tenia
un maximo de 720px y el espacio de la izquierda estaba vacio.

El corte es 980 y no 768: entre medio, 196px de barra dejan la columna
demasiado angosta y es peor que el nav de arriba.

**Abajo de 980px no cambia nada.** El nav agrupado y la barra del pulgar estan
medidos en un iPhone SE y funcionan; la barra lateral no los toca.

## Pestañas: agrupar por pregunta, no por tabla

La pagina del mes tenia diez secciones apiladas: para corregir un consumo habia
que pasar por los prestamos, lo que te deben y las categorias. Ahora son cuatro
pestañas —**Se fue, Entro, Debo, Ajustes**— y el corte es por la pregunta que
uno viene a hacerse, no por que tabla lo guarda.

Eso importa porque **antd desmonta el panel inactivo**: un formulario a medio
escribir en otra pestaña se pierde, y Ctrl+F no encuentra lo que esta cerrado.
Lo que se usa junto tiene que quedar junto, o el corte se paga cada vez.

Los rotulos son cortos y el monto del total **no** va en la pestaña en el
telefono: medido, cuatro pestañas con el monto entero ocupaban 559px en una
pantalla de 375 y empujaban tres fuera de vista. Un contador chico si se queda
—"3 cosas sin pagar" es justo lo que uno quiere ver sin abrir.

## Navegacion

Nueve secciones sueltas son nueve palabras indistinguibles. Van en **tres grupos
de tres** —Mes, Invertido, Panorama— porque uno de cuatro se parte y agrega un
renglon entero.

En el telefono, ademas, los cuatro de uso diario van **fijos abajo**, al alcance
del pulgar, y **se sacan del nav de arriba**: dos navegaciones con los mismos
links son ruido, y son justo los pixeles que la barra venia a liberar. El nav
superior quedo en 76px con los cinco secundarios.

Los iconos de la barra van **con su etiqueta**. Un icono solo obliga a adivinar,
y en finanzas adivinar sale caro.

## Colores y accesibilidad

**Todo color de texto se mide antes de usarlo**: `node scripts/contraste.mjs`, y
`lib/contraste.test.ts` lo verifica en cada corrida. El umbral es WCAG AA
(4.5:1) contra su propio fondo.

Esto no es cumplimiento por el cumplimiento. Los dos que estaban rotos parecian
bien a ojo: `--tinta-suave` en 4.46 —el color de cada nota y cada etiqueta de la
app— y `--alerta` en 3.78, que es justo el que marca los problemas. Que el texto
que avisa de algo sea el mas dificil de leer es el peor lugar donde ahorrar
contraste.

El **modo oscuro no invierte** la paleta clara: tiene pasos propios, medidos
contra el fondo oscuro, porque un color que pasa AA sobre papel casi nunca lo
pasa sobre tinta. Y antd necesita sus dos temas en `app/theme.tsx`: no lee
variables CSS, asi que con los colores claros clavados sus inputs quedarian
sobre fondo papel mientras el resto se oscurece.

`:focus-visible` esta en `globals.css` para todo lo navegable. Antes no habia
ninguno y quien usa teclado no sabia donde estaba parado.

## Graficos

La forma sale del trabajo que tiene que hacer el lector, y el color va al final.

- **Comparar cual es mas grande** (categorias de gasto, resultado por activo):
  barras. Horizontales, porque las etiquetas son nombres largos.
- **Parte-de-un-todo** (a donde fue el sueldo): barra **apilada**, no torta. Una
  torta obliga a comparar angulos, que el ojo hace mal; dos porciones parecidas
  son indistinguibles y hay que ir a leer los numeros igual.
- **Evolucion**: lineas.

La paleta categorica esta **validada**, no elegida a ojo: `#B4690E`, `#2D5FA8`,
`#1E7A4F` en ese orden pasan contraste sobre el papel, separacion bajo
daltonismo y piso de croma. Tres es el tope — un cuarto hue inventado se
confunde con alguno de estos bajo CVD. Si hacen falta mas partes, se agrupan
antes de llegar al grafico.

Todo grafico lleva su tabla gemela en un `<details>`: ningun valor puede quedar
solo detras del hover. Y las etiquetas y montos van en tinta, nunca en el color
de la serie; el color lo lleva la marca al lado. La unica excepcion es el texto
*adentro* de un relleno, que no tiene alternativa.

Ojo con `.leyenda`: es del grafico de lineas, con marca de 12x2. La barra
apilada usa `.leyenda-apilada` justamente para no pisarla.

## Prestar no es gastar

La plata que le prestas a alguien salio de tu bolsillo pero **sigue siendo
tuya**: lo que cambio es en que forma la tenes, de efectivo a credito a favor.
Por eso `prestamos_personales` no toca `calcularCierre`. Si lo tocara, el mes en
que prestas mostraria una tasa de ahorro pesima y el mes en que te devuelven una
buenisima — dos veces mal por el mismo movimiento.

La devolucion casi nunca es de una sola vez, asi que las devoluciones son filas
propias (`devoluciones`) y el saldo se **deriva**. Nada de un campo "devuelto"
que haya que acordarse de actualizar.

Dos detalles que salieron de mirar los casos reales:

- Devolver de mas no genera un pendiente negativo. Si te devolvieron mas, es un
  regalo o un error de carga; en ninguno de los dos casos le debes vos algo.
- Los montos se comparan con tolerancia de un centavo. `0.1 + 0.2 !== 0.3` en
  flotante, y sin tolerancia un prestamo devuelto entero queda "PARCIAL" con un
  saldo de fracciones de centavo.

Y las fechas se validan con `fechaValida()`, no solo con el regex: "2026-02-30"
tiene la forma correcta y `Date` la convierte calladita en el 2 de marzo, asi
que un error de tipeo quedaria guardado como otra fecha valida.

## Prestamos

Un prestamo no es un gasto: es un compromiso con cronograma. Se guarda **el plan**
(cuantas cuotas, de cuanto, desde cuando), no una fila por cuota — una fila por
cuota se desincroniza en cuanto se corrige un monto, y obliga a un proceso
mensual que "avance" el credito. Cual cuota cae en cada mes se deriva con
`lib/prestamos.ts`, que es puro y no toca la base.

La cuota del mes entra al cierre **calculada al vuelo**, en la categoria
`Cuotas`. De ahi la unica regla que hay que respetar: la misma cuota no puede
entrar por dos lados. Si ademas se carga como gasto suelto, o si el credito
debita en el resumen de la tarjeta, se cuenta dos veces y el ahorro del mes sale
mal. La pantalla lo dice; si agregas otra via de carga, decilo ahi tambien.

Cancelar anticipadamente corta **desde** ese mes, no despues: cancelaste en
junio, la cuota de junio ya no se paga.

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

## Planillas

Un `.xlsx` no es texto ni se le puede mostrar al modelo como un PDF: es un zip
con XML adentro. `lib/excel.ts` lo convierte a tabla delimitada y lo mete por el
**mismo camino que un CSV**, asi reusa la clasificacion, la censura de PII antes
de mandar nada al modelo, y la deduplicacion.

Lo que la conversion tiene que resolver, y que se rompe en silencio si no:

- Las fechas salen `YYYY-MM-DD`, no el numero de serie de Excel.
- De una formula sale el **resultado**, no `SUM(D2:D5)`.
- Un error de celda (`#N/A`) sale vacio: mandarlo como texto le hace inventar.
- El nombre de cada hoja va adelante. En un export de banco las hojas suelen ser
  meses o cuentas, y esa etiqueta es dato.

Un archivo subido es entrada no confiable: un zip de 50 kB descomprime a cientos
de megas. Hay tope de bytes **antes** de parsear, y de filas despues.

## Servidor MCP

`app/api/mcp` expone las finanzas a Claude Desktop / Claude Code. Tres reglas:

- **Solo lectura.** No hay una sola herramienta que escriba, y `lib/mcp.test.ts`
  lo verifica por nombre. La garantia no es que nadie las llame mal: es que no
  existen.
- **Agregado, no crudo.** `lib/consultas.ts` devuelve totales, categorias y
  conteos. No hay un volcado de tabla: lo que sale va a un modelo, y menos dato
  en el prompt es menos dato afuera. Todo pasa por `redactarProfundo`.
- **Token propio.** La cookie de sesion no sirve: el cliente MCP no pasa por el
  navegador. Va `Bearer <email>:<MCP_TOKEN>`, comparado en tiempo constante. Sin
  `MCP_TOKEN` el endpoint responde 401 a todo.

El despacho del protocolo vive en `lib/mcp.ts`, separado de la ruta, para poder
probarlo entero sin base ni servidor. La ruta se queda con transporte y auth.

Un error de argumento vuelve como `isError` dentro del resultado, **no** como
error de protocolo: el modelo tiene que poder leer "el periodo estaba mal" y
corregir, no cortar la conversacion.

## De quien es cada dato

Doce tablas tienen dueño (`usuario_id`). Las hijas —`consumos`, `positions`,
`devoluciones`— **no** lo llevan a proposito: se scopean por su padre. Una copia
del dueño en la hija puede desincronizarse y terminar apuntando a otra persona;
el padre no puede.

Tres capas para que no se pueda olvidar, y ninguna alcanza sola:

1. **El tipo**, para las escrituras. `usuarioId` es `notNull`, asi que un insert
   que se lo olvide **no compila**.
2. **`lib/scoping.test.ts`**, para las lecturas — que compilan igual sin filtro y
   son justo las que muestran datos de otra persona. Lee el codigo fuente y
   falla si una tabla con dueño se consulta sin nombrar `usuarioId`. Ya encontro
   dos fugas que se me habian pasado.
3. **La firma de cada funcion**: `usuarioId` va primero, siempre. Una funcion que
   recibe solo un `id` invita a usarla sin autorizar.

Un `id` **nunca** alcanza como autorizacion. `leerCredencial`, `borrarConexion` y
todo update por id filtran ademas por dueño: sin eso, conocer o adivinar el id de
otra persona bastaria para leerle la credencial de Binance.

Para saltear el chequeo hay que escribir `scoping-ok:` con el motivo, en la
consulta misma. Hoy hay **una sola**: `rotarCifrado()`, porque la clave de la
boveda es de la instalacion y rotarla tiene que alcanzar a todas las conexiones.

El cron de Drive corre sin sesion, con `idUsuarioDeLaInstalacion()`. No es un
atajo: las carpetas se configuran con variables de entorno globales, asi que esa
integracion es de una sola persona. Cuando las carpetas sean por usuario, el
cron itera y esa funcion desaparece.

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
