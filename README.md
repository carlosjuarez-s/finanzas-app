# Finanzas — Cierre mensual automatizado

App personal en Next.js + Vercel que lee tus carpetas de Google Drive
("Resúmenes de tarjeta" y "Salarios"), extrae los datos con la API de Claude,
los guarda en Postgres y muestra el cierre mensual: ingreso − gasto = ahorro,
categorías, suscripciones, cuotas, percepciones recuperables e inversiones.

## Arquitectura

```
Cron Vercel (día 22) ──▶ /api/sync ────┐
Subida manual ───────▶ /api/upload ────┤   (clasifica solo el tipo)
                                       ├──▶ lib/extract  (Anthropic → Gemini)
                                       ├──▶ lib/guardar  (statements/salaries/portfolio)
                                       └──▶ lib/cierre   (recalcula monthly_closes)
Dashboard (/) ◀── Postgres (server component)
```

**Identidad de un documento.** La columna `fileId` es el origen: el id del archivo
en Drive, o `upload:<sha256>` para los subidos a mano. El `unique` de esa columna
es lo que evita procesar (y pagar) dos veces el mismo PDF, venga de donde venga.

**`monthly_closes` es una vista materializada** de statements + consumos +
salaries: se recalcula tras cada sync o upload. `lib/cierre.ts` tiene el cálculo,
y lo usan tanto el dashboard (en vivo) como el histórico, para que no puedan
mostrar números distintos del mismo mes.

## Secciones

| Ruta | Qué hace |
|---|---|
| `/` | Cierre del mes, sync de Drive y subida manual de documentos |
| `/gastos` | Servicios, alquiler y consumos: revisar y **corregir** lo que interpretó el modelo |
| `/historico` | Evolución mes a mes y en qué se fue la plata acumulada |
| `/metas` | Metas de ahorro y cuándo se alcanzan según tu ritmo real |
| `/proyeccion` | Simulador "qué pasa si ahorro X%" y supuestos editables |

## Datos personales (PII)

`lib/pii.ts` censura CUIT/CUIL, DNI, CBU, tarjeta, email y teléfono. **El alcance
real es asimétrico y conviene tenerlo claro:**

| Camino | ¿Se censura antes del modelo? |
|---|---|
| Texto que escribís (`/api/gasto-texto`) | **Sí.** Se redacta antes de salir. |
| Lo que el modelo devuelve (columna `raw`) | **Sí.** Se redacta antes de guardarlo. |
| PDFs e imágenes | **No es posible.** |

El último caso no es una omisión: el modelo tiene que *leer* el documento para
extraer algo, y taparle el CUIL antes exigiría OCR — o sea, el mismo modelo. La
boleta viaja intacta al proveedor. Preferimos decirlo a mostrar un cartel de
"PII censurada" que sería falso en el caso más común.

El riesgo grande de esta función no es dejar pasar un dato, es **sobre-censurar**:
un DNI son 7-8 dígitos y un importe en pesos también. Por eso todo lo ambiguo se
ancla a su etiqueta (`DNI 12.345.678`) y solo se censura suelto lo inconfundible
(CUIT con guiones, email, 16 o 22 dígitos seguidos). Hay un test dedicado a que
los montos sobrevivan intactos.

## Corregir lo que el modelo interpretó mal

Todo lo extraído se puede rectificar en `/gastos`: concepto, categoría y monto de
gastos y consumos, y el neto del sueldo. Lo corregido queda marcado con
`corregido = true` — un dato que revisó una persona vale más que uno inferido — y
el cierre del mes se recalcula en el momento.

Los gastos sueltos se pueden borrar; los consumos de tarjeta no. Borrar una línea
dejaría el desglose sin cuadrar con el «TOTAL A PAGAR» del resumen, que es el
número que efectivamente se paga.

## Proyecciones

`lib/proyeccion.ts` es **matemática determinista, no un modelo de lenguaje**: un
LLM puede devolver un número plausible y equivocado, y acá se toman decisiones de
plata. Tiene tests (`npm test`) que lo contrastan contra la fórmula cerrada de
anualidad vencida.

**Todo se expresa en dólares reales de hoy.** Con inflación alta, un saldo nominal
en pesos a tres años no dice nada: "vas a tener 40 millones" no aclara si alcanza
para un auto. Fijando la unidad en poder de compra actual, los números se comparan
entre sí y contra una meta.

Los retornos de `SUPUESTOS_DEFAULT` son **supuestos editables, no predicciones**, y
se guardan en la tabla `settings`. El ~7% real del S&P 500 es un promedio histórico
de décadas que incluye caídas de más del 30%: ningún año concreto se parece al
promedio.

## Gráficos

La paleta de series (`SERIE_COLORES` en `app/line-chart.tsx`) está **validada con
el script de la skill de dataviz** contra el fondo papel. El orden ámbar → azul →
verde no es estético: con ámbar y verde adyacentes, el par cae a ΔE 6.1 bajo
daltonismo protán y deja de distinguirse; separados da 17.3. **No reordenar sin
volver a validar.**

> **Ojo:** `LineChart` recibe el formato **por nombre** (`formato="corto"`), no una
> función. React no puede serializar funciones de un server component a uno de
> cliente, y el error aparece recién al renderizar la página, no al compilar.

Los prompts de `lib/prompts.ts` son la spec validada del skill
"cierre-financiero" — misma lógica de categorización y reglas argentinas
(RG 4815/5617, cuotas NN/MM, MERPAGO*, formato de montos).

La extracción pasa por `lib/extract.ts`, que usa Anthropic y cae a Gemini sólo
si la cuenta no puede responder (sin crédito, key inválida, cuota agotada). Un
error de extracción real se propaga en vez de reintentarse en el otro proveedor.

## UI (Ant Design)

La UI usa **antd v6**, que soporta React 19 sin el parche de compatibilidad que
necesitaba v5. El montaje está en `app/layout.tsx`:

- `AntdRegistry` extrae los estilos en el server. Sin él, antd los inyecta recién
  en el cliente y la página parpadea sin estilos al cargar.
- `app/theme.tsx` mapea la paleta de `globals.css` a los tokens de antd (azul
  peso como `colorPrimary`, verde dólar como `colorSuccess`, `borderRadius: 0`).
  Para cambiar el look, ese es el único archivo a tocar.

> **Ojo al maquetar:** el App Router no soporta subcomponentes por dot notation
> (`<Typography.Title>`, `<Select.Option>`) dentro de un **server component** —
> falla con "Element type is invalid … got: undefined". En componentes
> `'use client'` funciona normalmente.

## Setup

### 1. Service account de Google (sin OAuth)
1. Google Cloud Console → crear proyecto → habilitar **Google Drive API**.
2. IAM → Service Accounts → crear una → Keys → agregar clave JSON.
3. En Google Drive, **compartir** las carpetas "Resúmenes de tarjeta",
   "Salarios" (y opcionalmente "Inversiones") con el `client_email` de la
   service account como **Lector**.
4. Pegar el JSON completo (una línea) en `GOOGLE_SERVICE_ACCOUNT_JSON`.

### 2. Base de datos (Neon)
Crear un Postgres gratuito en [Neon](https://neon.tech) y copiar la URL a
`DATABASE_URL`. Luego:

```bash
npm install
npx drizzle-kit push
```

### 3. Variables de entorno
Copiar `.env.example` a `.env` y completar todo (Anthropic API key,
password de la app, CRON_SECRET aleatorio).

### 4. Deploy
```bash
vercel deploy
```
Cargar las mismas variables en Vercel → Settings → Environment Variables.
El cron de `vercel.json` corre el día 22 de cada mes (después del cierre de
las tarjetas ~día 20). Nota: los crons de Vercel envían automáticamente el
header `Authorization: Bearer $CRON_SECRET` si definís esa variable.

## Uso

- **Sync manual**: `curl -X POST https://tu-app.vercel.app/api/sync -H "Authorization: Bearer $CRON_SECRET"`
- **Subir portfolio**: `curl -X POST .../api/portfolio -u carlos:$APP_PASSWORD -F periodo=2026-09 -F images=@binance.png -F images=@iol.png`
- **Dashboard**: abrir la app (Basic Auth: usuario `carlos`, tu password).
  `?periodo=2026-08` para ver meses anteriores.

## Próximos pasos sugeridos
- Página de upload de capturas desde el navegador (hoy es vía curl/Shortcut de iOS).
- Metas configurables (tabla `Goal`) y comparación en el ledger.
- Gráfico de evolución mensual cuando haya 3+ períodos.
- Alertas por WhatsApp/Telegram cuando el sync detecta algo inusual.
