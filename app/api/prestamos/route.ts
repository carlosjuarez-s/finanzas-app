import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { prestamos } from '@/db/schema';
import { guardarCierres } from '@/lib/cierre';
import { PERIODO } from '@/lib/prestamos';
import { mensajeDeError } from '@/lib/errores';

const numero = (v: unknown, min = 0): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : null;
};

const texto = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : null;
};

/** Lo que hay que validar antes de tocar la base, para POST y para PATCH. */
function leer(b: Record<string, unknown> | null) {
  const nombre = texto(b?.nombre);
  const cuotas = numero(b?.cuotas, 1);
  const cuotaArs = numero(b?.cuotaArs, 0.01);
  const primerPeriodo = String(b?.primerPeriodo ?? '');

  if (!nombre) return { error: 'Poné un nombre para reconocer el préstamo.' };
  if (!cuotas || !Number.isInteger(cuotas)) return { error: 'La cantidad de cuotas tiene que ser un número entero mayor a cero.' };
  if (cuotas > 600) return { error: 'Ese plazo no parece real: revisá la cantidad de cuotas.' };
  if (!cuotaArs) return { error: 'El monto de la cuota tiene que ser mayor a cero.' };
  if (!PERIODO.test(primerPeriodo)) return { error: 'El mes de la primera cuota tiene que ser YYYY-MM.' };

  const canceladoEn = texto(b?.canceladoEn);
  if (canceladoEn && !PERIODO.test(canceladoEn)) {
    return { error: 'El mes de cancelación tiene que ser YYYY-MM.' };
  }

  return {
    valores: {
      nombre,
      entidad: texto(b?.entidad),
      montoOtorgado: numero(b?.montoOtorgado, 0) ? String(numero(b?.montoOtorgado, 0)) : null,
      cuotas: String(cuotas),
      cuotaArs: String(cuotaArs),
      primerPeriodo,
      moneda: b?.moneda === 'USD' ? 'USD' : 'ARS',
      cftAnual: numero(b?.cftAnual, 0) ? String(numero(b?.cftAnual, 0)) : null,
      canceladoEn,
      notas: texto(b?.notas),
    },
  };
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const { error, valores } = leer(b);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const [fila] = await db.insert(prestamos).values(valores!).returning({ id: prestamos.id });
    // El cierre de cada mes con cuota cambia: hay que recalcularlo ya, o el
    // historico sigue mostrando el gasto de antes.
    await guardarCierres();
    return NextResponse.json({ id: fila.id });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  const { error, valores } = leer(b);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const [fila] = await db.update(prestamos).set(valores!)
      .where(eq(prestamos.id, String(b.id)))
      .returning({ id: prestamos.id });

    if (!fila) return NextResponse.json({ error: 'No se encontró ese préstamo.' }, { status: 404 });
    await guardarCierres();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  try {
    await db.delete(prestamos).where(eq(prestamos.id, id));
    await guardarCierres();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
