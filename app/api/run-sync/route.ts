import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';
import { idUsuarioActual } from '@/lib/usuario';

export const maxDuration = 300;

// Sync manual desde el navegador. La ruta no empieza con /api/sync, asi que el
// middleware le exige el mismo Basic Auth que al dashboard: el browser reenvia
// solo las credenciales y nunca hace falta exponer CRON_SECRET al cliente.
export async function POST() {
  const usuarioId = await idUsuarioActual();
  try {
    return NextResponse.json(await runSync(usuarioId));
  } catch (e) {
    // Sin esto, un error de configuracion llega al boton como un 500 sin texto.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
