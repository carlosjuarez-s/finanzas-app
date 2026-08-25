import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { goals } from '@/db/schema';

// El middleware ya exige Basic Auth en estas rutas.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nombre = String(body?.nombre ?? '').trim();
  const monto = Number(body?.montoObjetivo);
  const moneda = body?.moneda === 'ARS' ? 'ARS' : 'USD';

  // Validar en el server: el form puede saltearse, y una meta sin monto valido
  // rompe silenciosamente el calculo de progreso.
  if (!nombre) return NextResponse.json({ error: 'La meta necesita un nombre.' }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: 'El monto objetivo tiene que ser un numero mayor a cero.' }, { status: 400 });
  }

  const fecha = typeof body?.fechaObjetivo === 'string' && /^\d{4}-\d{2}$/.test(body.fechaObjetivo)
    ? body.fechaObjetivo : null;

  const [meta] = await db.insert(goals).values({
    nombre, montoObjetivo: String(monto), moneda, fechaObjetivo: fecha,
    notas: typeof body?.notas === 'string' && body.notas.trim() ? body.notas.trim() : null,
  }).returning();

  return NextResponse.json({ meta });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });
  await db.delete(goals).where(eq(goals.id, id));
  return NextResponse.json({ ok: true });
}
