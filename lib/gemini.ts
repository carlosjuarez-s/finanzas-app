import { GoogleGenAI } from '@google/genai';
import type { Documento } from './tipos';

let _client: GoogleGenAI | null = null;
// Flash tiene el limite gratuito mas alto y lee PDFs nativamente. Google retira
// las versiones viejas para cuentas nuevas (2.5-flash devuelve 404), asi que si
// vuelve a pasar se cambia por GEMINI_MODEL sin tocar el codigo.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

export const geminiConfigurado = () => Boolean(process.env.GEMINI_API_KEY?.trim());

export async function geminiGenerar(
  system: string, docs: Documento[], texto = 'Extrae el JSON.',
): Promise<string> {
  _client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await _client.models.generateContent({
    model: MODEL,
    // PDFs e imagenes usan la misma forma inlineData, a diferencia de Anthropic.
    contents: [{
      role: 'user',
      parts: [
        ...docs.map(d => ({ inlineData: { mimeType: d.mediaType, data: d.base64 } })),
        { text: texto },
      ],
    }],
    config: { systemInstruction: system, responseMimeType: 'application/json' },
  });
  const salida = res.text;
  if (!salida?.trim()) throw new Error('Gemini no devolvio texto (puede haber bloqueado el contenido).');
  return salida;
}
