import { NextResponse } from 'next/server';
import { sincronizarPortafolio } from '@/lib/sync-portafolio';
import { mensajeDeError } from '@/lib/errores';

export const maxDuration = 120;

export async function POST() {
  try {
    return NextResponse.json({ resultados: await sincronizarPortafolio() });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
