import Anthropic from '@anthropic-ai/sdk';
import { STATEMENT_SYSTEM, SALARY_SYSTEM, PORTFOLIO_SYSTEM } from './prompts';

let _client: Anthropic | null = null;
const MENSAJE_SIN_KEY =
  'Falta la variable ANTHROPIC_API_KEY en Vercel: sin ella no se pueden leer los PDFs. ' +
  'Se saca de console.anthropic.com > API Keys y empieza con sk-ant-.';

// Permite chequear la config una sola vez antes de un lote, en vez de fallar
// PDF por PDF despues de haberlos bajado de Drive.
export const faltaApiKey = (): string | null =>
  process.env.ANTHROPIC_API_KEY?.trim() ? null : MENSAJE_SIN_KEY;

// Lazy: el build de Next evalua los modulos y no debe exigir la key.
function getClient() {
  // El SDK, sin credenciales, tira "Could not resolve authentication method",
  // que no dice cual es la variable ni de donde sacarla.
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error(MENSAJE_SIN_KEY);
  return (_client ??= new Anthropic());
}
const MODEL = 'claude-sonnet-4-6';

function parseJson<T>(text: string): T {
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as T;
}

async function extractFromPdf<T>(system: string, pdfBase64: string): Promise<T> {
  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: 'Extrae el JSON.' },
      ],
    }],
  });
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJson<T>(text);
}

export type StatementData = {
  card: string; periodo: string; vencimiento: string;
  totalArs: number; totalUsd: number; percepArs: number;
  cuotasAVencer: { mes: string; montoArs: number }[];
  consumos: { fecha: string; comercio: string; categoria: string; cuota: string | null; montoArs: number; montoUsd: number }[];
};
export type SalaryData = { recibos: { periodo: string; netoArs: number }[] };
export type PortfolioData = {
  plataforma: string; totalUsd: number | null; totalArs: number | null;
  positions: { activo: string; clase: string; cantidad: number; valorUsd: number | null; valorArs: number | null }[];
};

export const extractStatement = (pdf: string) => extractFromPdf<StatementData>(STATEMENT_SYSTEM, pdf);
export const extractSalary = (pdf: string) => extractFromPdf<SalaryData>(SALARY_SYSTEM, pdf);

export async function extractPortfolio(images: { base64: string; mediaType: string }[]): Promise<PortfolioData> {
  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: PORTFOLIO_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        ...images.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType as 'image/png', data: i.base64 } })),
        { type: 'text', text: 'Extrae el JSON.' },
      ],
    }],
  });
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJson<PortfolioData>(text);
}
