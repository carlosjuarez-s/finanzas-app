import Anthropic from '@anthropic-ai/sdk';
import type { Documento } from './tipos';

let _client: Anthropic | null = null;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

export const anthropicConfigurado = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

// Distingue "esta cuenta no puede responder" (falta credito, key invalida,
// cuota agotada) de un error real de extraccion. Solo lo primero justifica
// caer al proveedor de respaldo; un PDF ilegible tiene que fallar de verdad.
export function anthropicSinCredito(e: unknown): boolean {
  if (!(e instanceof Anthropic.APIError)) return false;
  if (e.status === 401 || e.status === 403 || e.status === 429) return true;
  // El saldo agotado llega como 400 invalid_request_error, no como 402.
  return e.status === 400 && /credit balance|billing|quota|insufficient/i.test(e.message);
}

// Los PDFs van como bloque "document" y las capturas como "image": el SDK
// valida el tipo contra el media_type, no acepta uno por el otro.
const bloque = (d: Documento) =>
  d.mediaType === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: d.base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: d.mediaType as 'image/png', data: d.base64 } };

export async function anthropicGenerar(system: string, docs: Documento[]): Promise<string> {
  _client ??= new Anthropic();
  const msg = await _client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{
      role: 'user',
      content: [...docs.map(bloque), { type: 'text', text: 'Extrae el JSON.' }],
    }],
  });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
