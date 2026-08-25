// Prompts de extraccion — portados del skill "cierre-financiero".
// Son la spec funcional validada contra resumenes reales de Master y Visa.

export const CATEGORIAS = [
  'Suscripciones', 'Servicios', 'Salud y deporte', 'Supermercado y comida',
  'Compras y hogar', 'Cuotas', 'Comisiones bancarias', 'Impuestos y percepciones',
] as const;

// Los esquemas viven aparte del encabezado para que el clasificador
// (CLASSIFY_SYSTEM) reuse exactamente las mismas reglas validadas y no haya dos
// versiones de la logica de categorizacion conviviendo.
export const STATEMENT_SPEC = `{
  "card": "MASTER" | "VISA",
  "periodo": "YYYY-MM",            // mes del vencimiento del resumen
  "vencimiento": "YYYY-MM-DD",
  "totalArs": number,               // TOTAL A PAGAR en pesos
  "totalUsd": number,               // TOTAL A PAGAR en dolares
  "percepArs": number,              // suma de percepciones RG 4815 / RG 5617 del mes
  "cuotasAVencer": [{"mes": "YYYY-MM", "montoArs": number}],
  "consumos": [{
    "fecha": "YYYY-MM-DD",
    "comercio": string,             // limpio, sin codigos de comprobante
    "categoria": string,            // una de: ${CATEGORIAS.join(', ')}
    "cuota": string | null,         // "08/09" si es cuota, null si no
    "montoArs": number,
    "montoUsd": number
  }]
}

Reglas criticas:
- "SU PAGO" y devoluciones (DEV PER RG 4815, DEV.IMP. RG 5617) son movimientos de saldo, NO consumos: excluirlos de "consumos".
- Impuestos del resumen (sellos, percepcion IVA, RG 4815/5617, DB IVA, SERVICIO CUENTA) van como consumos con categoria "Impuestos y percepciones" o "Comisiones bancarias" segun corresponda.
- Consumos en USD: patron "(USA,USD, X.XX)" en Master o marca "K"/"inXXXUSD" en Visa; montoArs=0 y montoUsd=el valor.
- Cuotas: comercio termina en "NN/MM"; la fecha es la de la compra original.
- MERPAGO*<comercio>: categorizar por el comercio real. Confirmados: SATTUCUMAN=agua (Servicios), KAMILA=tienda (Compras y hogar).
- Suscripciones tipicas: OPENAI, GOOGLE, ANTHROPIC/CLAUDE, SUNO, NETFLIX, SPOTIFY.
- Verifica que la suma de consumos ARS cuadre con el subtotal del resumen; si hay diferencia agrega un consumo "Ajuste/redondeo".
- Los montos usan formato argentino en el PDF (1.234,56): convertirlos a number estandar.`;

export const SALARY_SPEC = `{ "recibos": [{ "periodo": "YYYY-MM", "netoArs": number }] }

"periodo" sale del campo PERIODO DE PAGO. "netoArs" es el Neto Percibido. Un PDF puede traer varios recibos: devolvelos todos. Ignorar CUIL, legajo y direccion.`;

export const PORTFOLIO_SPEC = `{
  "plataforma": "BINANCE" | "IOL" | string,
  "totalUsd": number | null,
  "totalArs": number | null,
  "positions": [{
    "activo": string,                 // ticker o simbolo: BTC, USDT, SPY, AL30
    "clase": "CRIPTO" | "CEDEAR" | "RENTA_FIJA" | "FCI" | "DOLAR",
    "cantidad": number,
    "valorUsd": number | null,
    "valorArs": number | null
  }]
}

No inventes cotizaciones: si una posicion no muestra valuacion, deja valorUsd/valorArs en null. No mezcles variaciones porcentuales con valores absolutos.`;

// Prompts de un solo tipo: los usa el sync, que ya sabe que hay en cada carpeta.
export const STATEMENT_SYSTEM = `Sos un extractor de datos de resumenes de tarjeta de credito argentinos (Mastercard/Visa de bancos locales). Recibis el PDF y devolves SOLO un JSON valido, sin markdown ni texto extra, con esta forma exacta:

${STATEMENT_SPEC}`;

export const SALARY_SYSTEM = `Sos un extractor de recibos de sueldo argentinos (Sistemas Globales S.A. / Globant). Recibis el PDF y devolves SOLO JSON valido:

${SALARY_SPEC}`;

export const PORTFOLIO_SYSTEM = `Sos un extractor de capturas de pantalla de portfolios de inversion (Binance, InvertirOnline/IOL, brokers argentinos). Recibis una o mas imagenes y devolves SOLO JSON valido:

${PORTFOLIO_SPEC}`;

// Prompt del upload manual: el archivo llega sin contexto, asi que el modelo
// decide primero que es y despues extrae con el esquema que corresponda.
export const CLASSIFY_SYSTEM = `Sos un clasificador y extractor de documentos financieros argentinos. Recibis un documento (PDF o imagen) sin ningun contexto previo y devolves SOLO un JSON valido, sin markdown, con esta forma:

{ "tipo": "STATEMENT" | "SALARY" | "PORTFOLIO" | "DESCONOCIDO", "datos": { ... } }

Identifica el tipo antes de extraer:
- STATEMENT: resumen o estado de cuenta de tarjeta de credito, con consumos y total a pagar.
- SALARY: recibo de sueldo o liquidacion de haberes, con neto percibido.
- PORTFOLIO: tenencias de inversion (Binance, IOL, brokers), normalmente una captura.
- DESCONOCIDO: cualquier otra cosa, o un documento demasiado ilegible para confiar en lo extraido.

Ante la duda usa DESCONOCIDO: un dato mal clasificado ensucia el cierre del mes y es peor que no cargar nada.

Si tipo es DESCONOCIDO, "datos" es { "motivo": "<una frase explicando que es el documento o por que no se pudo leer>" }.

En los demas casos "datos" respeta exactamente el esquema de su tipo:

## tipo = STATEMENT
${STATEMENT_SPEC}

## tipo = SALARY
${SALARY_SPEC}

## tipo = PORTFOLIO
${PORTFOLIO_SPEC}`;
