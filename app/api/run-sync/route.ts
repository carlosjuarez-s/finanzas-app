import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export const maxDuration = 300;

// Sync manual desde el navegador. La ruta no empieza con /api/sync, asi que el
// middleware le exige el mismo Basic Auth que al dashboard: el browser reenvia
// solo las credenciales y nunca hace falta exponer CRON_SECRET al cliente.
export async function POST() {
  return NextResponse.json(await runSync());
}
