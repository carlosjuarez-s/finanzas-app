import { NextResponse } from 'next/server';
import { importarHistorial } from '@/lib/importar-binance';
import { mensajeDeError } from '@/lib/errores';

// Una cuenta con muchos activos consulta un par por vez: puede tardar.
export const maxDuration = 300;

export async function POST() {
  try {
    return NextResponse.json({ resultados: await importarHistorial() });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
