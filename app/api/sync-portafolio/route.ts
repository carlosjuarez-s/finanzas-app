import { NextResponse } from 'next/server';
import { sincronizarPortafolio } from '@/lib/sync-portafolio';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

export const maxDuration = 120;

export async function POST() {
  const usuarioId = await idUsuarioActual();
  try {
    return NextResponse.json({ resultados: await sincronizarPortafolio(usuarioId) });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
