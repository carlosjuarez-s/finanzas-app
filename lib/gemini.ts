import { GoogleGenAI } from '@google/genai';
import type { Documento } from './tipos';

let _client: GoogleGenAI | null = null;
// Flash tiene el limite gratuito mas alto (1500 req/dia) y lee PDFs nativamente.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

export const geminiConfigurado = () => Boolean(process.env.GEMINI_API_KEY?.trim());

export async function geminiGenerar(system: string, docs: Documento[]): Promise<string> {
  _client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await _client.models.generateContent({
    model: MODEL,
    // PDFs e imagenes usan la misma forma inlineData, a diferencia de Anthropic.
    contents: [{
      role: 'user',
      parts: [
        ...docs.map(d => ({ inlineData: { mimeType: d.mediaType, data: d.base64 } })),
        { text: 'Extrae el JSON.' },
      ],
    }],
    config: { systemInstruction: system, responseMimeType: 'application/json' },
  });
  const texto = res.text;
  if (!texto?.trim()) throw new Error('Gemini no devolvio texto (puede haber bloqueado el contenido).');
  return texto;
}
