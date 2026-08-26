import { STATEMENT_SYSTEM, SALARY_SYSTEM, PORTFOLIO_SYSTEM, CLASSIFY_SYSTEM, TEXTO_SYSTEM } from './prompts';
import { anthropicConfigurado, anthropicGenerar, anthropicSinCredito } from './anthropic';
import { geminiConfigurado, geminiGenerar } from './gemini';
import { redactar, redactarProfundo } from './pii';
import type {
  Documento, StatementData, SalaryData, PortfolioData, DocumentoClasificado, TextoClasificado,
} from './tipos';

export type {
  Documento, StatementData, SalaryData, PortfolioData, GastoData,
  DocumentoClasificado, TextoClasificado,
} from './tipos';

const SIN_PROVEEDOR =
  'Falta configurar un proveedor de IA en Vercel: ANTHROPIC_API_KEY (console.anthropic.com) ' +
  'o, como alternativa gratuita, GEMINI_API_KEY (aistudio.google.com).';

// Chequeo instantaneo para fallar antes de bajar los PDFs de Drive.
export const faltaProveedor = (): string | null =>
  anthropicConfigurado() || geminiConfigurado() ? null : SIN_PROVEEDOR;

function parseJson<T>(text: string): T {
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as T;
}

// Anthropic primero por calidad de extraccion; Gemini queda de respaldo para
// que un saldo agotado no corte el cierre del mes. Un error que no sea de
// credito se propaga: si el PDF esta ilegible, reintentarlo en Gemini solo
// esconde el problema.
async function generar(system: string, docs: Documento[], texto?: string): Promise<string> {
  if (anthropicConfigurado()) {
    try {
      return await anthropicGenerar(system, docs, texto);
    } catch (e) {
      if (!anthropicSinCredito(e) || !geminiConfigurado()) throw e;
      console.warn('Anthropic no disponible, usando Gemini:', e instanceof Error ? e.message : e);
    }
  }
  if (!geminiConfigurado()) throw new Error(SIN_PROVEEDOR);
  return geminiGenerar(system, docs, texto);
}

const pdf = (base64: string): Documento[] => [{ base64, mediaType: 'application/pdf' }];

export const extractStatement = async (b64: string) =>
  parseJson<StatementData>(await generar(STATEMENT_SYSTEM, pdf(b64)));

export const extractSalary = async (b64: string) =>
  parseJson<SalaryData>(await generar(SALARY_SYSTEM, pdf(b64)));

export const extractPortfolio = async (images: Documento[]) =>
  parseJson<PortfolioData>(await generar(PORTFOLIO_SYSTEM, images));

// Para archivos subidos a mano, que llegan sin la pista de en que carpeta de
// Drive estaban: el modelo clasifica y extrae en una sola llamada.
//
// Lo que vuelve se redacta antes de que lo vea el resto de la app: es lo que
// termina archivado en la columna `raw`, y ahi es donde quedan el CUIL y el
// legajo de un recibo si nadie los saca.
export const clasificarDocumento = async (doc: Documento) =>
  redactarProfundo(parseJson<DocumentoClasificado>(await generar(CLASSIFY_SYSTEM, [doc])));

// Analisis narrativo sobre datos ya agregados y redactados. El JSON que entra
// lo arma lib/analisis.ts; aca solo se despacha al proveedor disponible.
export const generarAnalisis = async <T>(system: string, datos: string): Promise<T> =>
  parseJson<T>(await generar(system, [], `Datos:\n${datos}`));

// Carga por descripcion escrita. Aca la redaccion SI protege de verdad: el texto
// se limpia antes de salir hacia el proveedor, no despues.
export async function interpretarTexto(descripcion: string) {
  const { texto, hallazgos } = redactar(descripcion);
  const hoy = new Date().toISOString().slice(0, 10);
  const system = TEXTO_SYSTEM.replace('{HOY}', hoy);
  const salida = parseJson<TextoClasificado>(
    await generar(system, [], `Gasto a interpretar:\n${texto}`),
  );
  return { resultado: redactarProfundo(salida), hallazgos };
}
