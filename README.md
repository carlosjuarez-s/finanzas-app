# Finanzas — Cierre mensual automatizado

App personal en Next.js + Vercel que lee tus carpetas de Google Drive
("Resúmenes de tarjeta" y "Salarios"), extrae los datos con la API de Claude,
los guarda en Postgres y muestra el cierre mensual: ingreso − gasto = ahorro,
categorías, suscripciones, cuotas, percepciones recuperables e inversiones.

## Arquitectura

```
Cron Vercel (día 22) ──▶ /api/sync ──▶ Drive (service account, readonly)
                                  └──▶ Claude API (PDF → JSON estructurado)
                                  └──▶ Postgres (Drizzle)
Capturas Binance/IOL ──▶ /api/portfolio ──▶ Claude API (visión) ──▶ Postgres
Dashboard (/) ◀── Postgres (server component, sin client JS)
```

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
