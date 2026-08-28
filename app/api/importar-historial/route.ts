import { NextResponse } from 'next/server';
import { importarHistorial } from '@/lib/importar-binance';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

// Una cuenta con muchos activos consulta un par por vez: puede tardar.
export const maxDuration = 300;

export async function POST() {
  const usuarioId = await idUsuarioActual();
  try {
    return NextResponse.json({ resultados: await importarHistorial(usuarioId) });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
