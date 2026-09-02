// Tipos compartidos entre los proveedores de extraccion (Anthropic, Gemini) y
// quienes los consumen. Viven aparte para que los proveedores no dependan del
// despachante ni entre si.

// Un PDF o una imagen en base64, listo para mandar a cualquiera de los dos.
export type Documento = { base64: string; mediaType: string };

export type StatementData = {
  card: string; periodo: string; vencimiento: string;
  totalArs: number; totalUsd: number; percepArs: number;
  cuotasAVencer: { mes: string; montoArs: number }[];
  consumos: { fecha: string; comercio: string; categoria: string; cuota: string | null; montoArs: number; montoUsd: number }[];
};

export type SalaryData = { recibos: { periodo: string; netoArs: number }[] };

// Lo que el upload reporta por archivo. Vive aca y no en la ruta para que el
// componente de cliente lo importe sin arrastrar el modulo del servidor.
export type ResultadoArchivo = {
  nombre: string;
  estado: 'cargado' | 'duplicado' | 'desconocido' | 'error';
  tipo?: string;
  detalle?: string;
};

// Un gasto suelto: boleta de servicio, alquiler, comprobante informal o texto.
export type GastoData = {
  periodo: string;
  fecha: string | null;
  concepto: string;
  categoria: string;
  montoArs: number;
  montoUsd: number;
};

// Resultado del upload manual: el tipo lo decide el modelo, asi que la union
// obliga a chequearlo antes de tocar los datos.
export type DocumentoClasificado =
  | { tipo: 'STATEMENT'; datos: StatementData }
  | { tipo: 'SALARY'; datos: SalaryData }
  | { tipo: 'GASTO'; datos: GastoData }
  | { tipo: 'PORTFOLIO'; datos: PortfolioData }
  | { tipo: 'DESCONOCIDO'; datos: { motivo?: string } };

// Un plan de cuotas descrito a mano: "compre una heladera en 12 cuotas de 45 mil".
export type CuotasData = {
  nombre: string;
  entidad: string | null;
  cuotas: number;
  cuotaArs: number;
  primerPeriodo: string;          // YYYY-MM
  montoOtorgado: number | null;
};

export type TextoClasificado =
  | { tipo: 'GASTO'; datos: GastoData }
  | { tipo: 'CUOTAS'; datos: CuotasData }
  | { tipo: 'DESCONOCIDO'; datos: { motivo?: string } };

// Un movimiento de un export de broker: la fila cruda ya interpretada.
export type MovimientoData = {
  activo: string;
  clase: string;
  tipo: 'COMPRA' | 'VENTA';
  fecha: string;
  cantidad: number;
  precioUnitario: number;
  moneda: 'ARS' | 'USD';
  comision: number;
};

// Resultado de subir un CSV o un TXT. A diferencia de un PDF, el contenido se
// puede censurar antes de mandarlo al modelo.
export type ArchivoTextoClasificado =
  | { tipo: 'MOVIMIENTOS'; datos: { movimientos: MovimientoData[] } }
  | { tipo: 'GASTO'; datos: GastoData }
  | { tipo: 'DESCONOCIDO'; datos: { motivo?: string } };

export type PortfolioData = {
  plataforma: string; totalUsd: number | null; totalArs: number | null;
  positions: { activo: string; clase: string; cantidad: number; valorUsd: number | null; valorArs: number | null }[];
};

// Deteccion del tipo de archivo subido.
//
// Los binarios los tiene que VER el modelo; los de texto se pueden leer y
// censurar antes de mandarlos. Por eso van por caminos distintos.
export const TIPOS_BINARIOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// El mimetype de un .csv es un desastre entre navegadores y sistemas: Excel lo
// registra como application/vnd.ms-excel, algunos mandan octet-stream y otros
// no mandan nada. Decidir solo por mimetype rechaza exports validos sin motivo,
// asi que la extension tambien cuenta.
const TIPOS_TEXTO = ['text/csv', 'text/plain', 'text/tab-separated-values', 'application/csv', 'application/vnd.ms-excel'];

export const esArchivoTexto = (nombre: string, mimeType: string): boolean =>
  TIPOS_TEXTO.includes(mimeType) || /\.(csv|txt|tsv)$/i.test(nombre ?? '');

export const esArchivoBinario = (mimeType: string): boolean =>
  TIPOS_BINARIOS.includes(mimeType);
