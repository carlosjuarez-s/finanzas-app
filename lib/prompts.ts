// Prompts de extraccion — portados del skill "cierre-financiero".
// Son la spec funcional validada contra resumenes reales de Master y Visa.

export const CATEGORIAS = [
  'Suscripciones', 'Servicios', 'Salud y deporte', 'Supermercado y comida',
  'Compras y hogar', 'Cuotas', 'Comisiones bancarias', 'Impuestos y percepciones',
  // Gastos que no pasan por la tarjeta y antes no tenian donde caer.
  'Alquiler', 'Transporte', 'Educacion', 'Otros',
] as const;

// Esquema de un gasto suelto: boleta de servicio, alquiler, o cualquier
// comprobante informal fotografiado.
export const GASTO_SPEC = `{
  "periodo": "YYYY-MM",             // mes al que corresponde el gasto
  "fecha": "YYYY-MM-DD" | null,     // si el comprobante la muestra
  "concepto": string,               // "Luz - EDET", "Alquiler septiembre", "Internet Fibertel"
  "categoria": string,              // una de: ${CATEGORIAS.join(', ')}
  "montoArs": number,
  "montoUsd": number                // 0 salvo que el comprobante este en dolares
}

Reglas:
- Servicios tipicos argentinos: EDET/EDENOR/EDESUR (luz), Metrogas/Naturgy (gas), Aguas/OSN (agua), Fibertel/Telecentro/Movistar/Personal/Claro (internet, telefonia). Todos van en categoria "Servicios".
- El alquiler va en "Alquiler", aunque sea un recibo escrito a mano o un papel fotografiado.
- Si el comprobante muestra "total a pagar" y tambien "segundo vencimiento" (mas caro), usar el PRIMER vencimiento: es lo que se paga en termino.
- Si no se ve el periodo, deducirlo de la fecha de vencimiento. Si tampoco, usar el mes de la fecha de emision.
- Los montos vienen en formato argentino (1.234,56): convertirlos a number estandar.
- No inventes un monto: si el importe no se lee con claridad, es preferible DESCONOCIDO.`;

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
- GASTO: un unico gasto. Boleta de servicio (luz, agua, gas, internet, telefonia), impuesto, o un comprobante informal: un recibo de alquiler escrito a mano, un ticket, un papel fotografiado. Si es un solo importe a pagar y no una lista de consumos, es GASTO y no STATEMENT.
- PORTFOLIO: tenencias de inversion (Binance, IOL, brokers), normalmente una captura.
- DESCONOCIDO: cualquier otra cosa, o un documento demasiado ilegible para confiar en lo extraido.

La foto puede estar torcida, con sombras o ser de un papel manuscrito: eso es esperable y no es motivo para devolver DESCONOCIDO. Lo es no poder leer el importe con confianza.

Ante la duda usa DESCONOCIDO: un dato mal clasificado ensucia el cierre del mes y es peor que no cargar nada.

Si tipo es DESCONOCIDO, "datos" es { "motivo": "<una frase explicando que es el documento o por que no se pudo leer>" }.

En los demas casos "datos" respeta exactamente el esquema de su tipo:

## tipo = STATEMENT
${STATEMENT_SPEC}

## tipo = SALARY
${SALARY_SPEC}

## tipo = GASTO
${GASTO_SPEC}

## tipo = PORTFOLIO
${PORTFOLIO_SPEC}`;

// Carga por texto: "pague 85000 de alquiler en septiembre". El texto ya viene
// redactado de datos personales antes de llegar al modelo.
export const TEXTO_SYSTEM = `Interpretas una descripcion escrita a mano alzada de un gasto y devolves SOLO JSON valido, sin markdown:

{ "tipo": "GASTO" | "DESCONOCIDO", "datos": { ... } }

Si se entiende el gasto, "datos" respeta este esquema:

${GASTO_SPEC}

Reglas propias del texto libre:
- Los montos pueden venir informales: "85 lucas" y "85 mil" son 85000; "1,2 palos" son 1200000.
- Los meses pueden venir por nombre ("septiembre", "sept") o relativos ("este mes", "el mes pasado"). Hoy es {HOY}: resolvelos contra esa fecha.
- Si no se aclara el mes, usar el mes actual.
- Si no hay un importe reconocible, devolver DESCONOCIDO con { "motivo": "..." }. Nunca inventar un numero.
- Si la descripcion menciona varios gastos, quedarse con el principal y aclararlo en "concepto".`;
