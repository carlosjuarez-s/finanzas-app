import { NextRequest, NextResponse } from 'next/server';
import { extractPortfolio } from '@/lib/extract';
import { guardarPortfolio } from '@/lib/guardar';
import { idUsuarioActual } from '@/lib/usuario';

export const maxDuration = 120;

// POST multipart/form-data con capturas (campo "images") y "periodo" YYYY-MM.
export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const form = await req.formData();
  const periodo = (form.get('periodo') as string) || new Date().toISOString().slice(0, 7);
  const files = form.getAll('images') as File[];
  if (!files.length) return NextResponse.json({ error: 'Subi al menos una captura' }, { status: 400 });

  const images = await Promise.all(files.map(async f => ({
    base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
    mediaType: f.type || 'image/png',
  })));

  const data = await extractPortfolio(images);
  const { posiciones } = await guardarPortfolio(usuarioId, periodo, data);

  return NextResponse.json({ ok: true, plataforma: data.plataforma, positions: posiciones });
}
