import ExcelJS from 'exceljs';

/**
 * Planillas a texto.
 *
 * Un .xlsx es un zip con XML adentro: no se puede leer como texto ni mostrarle
 * el binario al modelo como se hace con un PDF. Se parsea acá y sale como
 * tabla delimitada, que es exactamente lo que ya sabe interpretar el camino de
 * los CSV. Asi la planilla reusa todo lo que ya existe: la clasificacion, la
 * censura de PII antes de mandar nada al modelo, y la deduplicacion.
 *
 * Un archivo subido es entrada no confiable: un zip de 50 kB puede descomprimir
 * a cientos de megas. Por eso hay tope de bytes antes de parsear y tope de
 * filas y de caracteres despues.
 */

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_FILAS_POR_HOJA = 5000;

export class ErrorExcel extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorExcel';
  }
}

/** Una celda, en el texto mas parecido a lo que se ve en la planilla. */
export function celdaATexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v.trim();

  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Una formula: interesa el resultado, no como se calculo.
    if ('result' in o) return celdaATexto(o.result);
    // Un hipervinculo: el texto que se ve.
    if ('text' in o) return celdaATexto(o.text);
    // Texto con formato: viene partido en pedazos con estilo.
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: unknown }[]).map(t => celdaATexto(t.text)).join('');
    }
    if ('error' in o) return '';   // #N/A y compañia no son un dato
  }
  return '';
}

export const esArchivoExcel = (nombre: string, mimeType: string): boolean =>
  /\.(xlsx|xlsm)$/i.test(nombre ?? '') ||
  mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Convierte el libro entero a texto. Cada hoja va con su nombre adelante: en un
 * export de banco las hojas suelen ser meses o cuentas, y esa etiqueta es dato.
 */
export async function excelATexto(buf: Buffer): Promise<string> {
  if (buf.length > MAX_BYTES) {
    throw new ErrorExcel(
      `La planilla pesa ${Math.round(buf.length / 1024 / 1024)} MB y el máximo es ${MAX_BYTES / 1024 / 1024} MB.`,
    );
  }

  const libro = new ExcelJS.Workbook();
  try {
    // El cast: los tipos de exceljs piden su propio Buffer, que en runtime es
    // el mismo objeto de Node.
    await libro.xlsx.load(buf as unknown as ArrayBuffer);
  } catch (e) {
    throw new ErrorExcel(
      `No se pudo leer la planilla: ${e instanceof Error ? e.message : String(e)}. ` +
      'Si es un .xls viejo, guardalo como .xlsx o exportalo a CSV.',
    );
  }

  const partes: string[] = [];

  libro.eachSheet(hoja => {
    const filas: string[] = [];
    let recortada = false;

    hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
      if (numero > MAX_FILAS_POR_HOJA) { recortada = true; return; }

      const celdas: string[] = [];
      // values viene con un hueco en el indice 0: exceljs numera desde 1.
      const valores = Array.isArray(fila.values) ? fila.values.slice(1) : [];
      for (const v of valores) celdas.push(celdaATexto(v));

      // Una fila de separacion visual no aporta nada y gasta prompt.
      while (celdas.length && celdas[celdas.length - 1] === '') celdas.pop();
      if (celdas.some(c => c !== '')) filas.push(celdas.join(' | '));
    });

    if (!filas.length) return;

    partes.push(`## Hoja: ${hoja.name}`);
    partes.push(filas.join('\n'));
    if (recortada) {
      partes.push(`(se leyeron las primeras ${MAX_FILAS_POR_HOJA} filas de esta hoja)`);
    }
  });

  if (!partes.length) throw new ErrorExcel('La planilla no tiene ninguna fila con datos.');
  return partes.join('\n\n');
}
