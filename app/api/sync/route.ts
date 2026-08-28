import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';
import { idUsuarioDeLaInstalacion } from '@/lib/usuario';

export const maxDuration = 300; // extraer varios PDFs lleva tiempo

// Corre por cron de Vercel (dia 22 de cada mes) o manualmente con POST.
// El middleware no protege esta ruta: se autentica con CRON_SECRET.
export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  // Sin sesion: corre para el dueño de la instalacion. Las carpetas de Drive
  // son globales, asi que esta sincronizacion es de una sola persona.
  return NextResponse.json(await runSync(await idUsuarioDeLaInstalacion()));
}
