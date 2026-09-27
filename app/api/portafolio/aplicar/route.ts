import { NextRequest, NextResponse } from 'next/server';
import { aplicarConciliacion, validarTenencias } from '@/lib/conciliar-servidor';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

// Escribe lo que la persona confirmo en la vista previa. Lo que llega es el
// estado FINAL de cada cuenta, no una lista de novedades: por eso mandarlo dos
// veces deja la base igual que mandarlo una.
export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const body = await req.json().catch(() => null);

  const plataformas = (Array.isArray(body?.plataformas) ? body.plataformas : [])
    .map((p: { plataforma?: unknown; tenencias?: unknown }) => ({
      plataforma: String(p?.plataforma ?? '').trim().slice(0, 60),
      tenencias: validarTenencias(p?.tenencias).tenencias,
    }))
    .filter((p: { plataforma: string }) => p.plataforma);
  if (!plataformas.length) return NextResponse.json({ error: 'No hay ninguna cuenta para actualizar.' }, { status: 400 });

  const precios: Record<string, number | null> = {};
  for (const [activo, v] of Object.entries(body?.precios ?? {})) {
    const n = v === null ? null : Number(v);
    if (n === null || (Number.isFinite(n) && n > 0)) precios[activo.toUpperCase()] = n;
  }

  const dichos: Record<string, { precioUsd: number | null; fecha: string | null }> = {};
  for (const [activo, v] of Object.entries(body?.dichos ?? {})) {
    const d = v as { precioUsd?: unknown; fecha?: unknown };
    const p = Number(d?.precioUsd);
    dichos[activo.toUpperCase()] = {
      precioUsd: Number.isFinite(p) && p > 0 ? p : null,
      fecha: typeof d?.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : null,
    };
  }

  try {
    return NextResponse.json(await aplicarConciliacion(usuarioId, { plataformas, precios, dichos }));
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
