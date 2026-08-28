import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { prestamosPersonales, devoluciones } from '@/db/schema';
import { fechaValida } from '@/lib/fiado';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

const numero = (v: unknown, min = 0): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : null;
};
const texto = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : null;
};

// Una devolucion entra por la misma ruta pero va a otra tabla: es un pago
// contra un prestamo, no un prestamo nuevo.
async function crearDevolucion(usuarioId: string, b: Record<string, unknown>) {
  const monto = numero(b.monto, 0.01);
  const prestamoId = texto(b.prestamoId);
  if (!prestamoId) return { error: 'Falta el préstamo al que corresponde.' };
  if (!monto) return { error: 'El monto devuelto tiene que ser mayor a cero.' };
  if (!fechaValida(String(b.fecha))) return { error: 'La fecha tiene que ser un día real, con formato YYYY-MM-DD.' };

  const existe = await db.query.prestamosPersonales.findFirst({
    where: and(eq(prestamosPersonales.usuarioId, usuarioId), eq(prestamosPersonales.id, prestamoId)),
    columns: { id: true },
  });
  if (!existe) return { error: 'No se encontró ese préstamo.' };

  const [fila] = await db.insert(devoluciones).values({
    prestamoId, fecha: String(b.fecha), monto: String(monto), notas: texto(b.notas),
  }).returning({ id: devoluciones.id });
  return { id: fila.id };
}

export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);

  try {
    if (b?.entidad === 'devolucion') {
      const r = await crearDevolucion(usuarioId, b);
      return NextResponse.json(r, { status: r.error ? 400 : 200 });
    }

    const persona = texto(b?.persona);
    const monto = numero(b?.monto, 0.01);

    if (!persona) return NextResponse.json({ error: 'Poné a quién le prestaste.' }, { status: 400 });
    if (!monto) return NextResponse.json({ error: 'El monto tiene que ser mayor a cero.' }, { status: 400 });
    if (!fechaValida(String(b?.fecha))) {
      return NextResponse.json({ error: 'La fecha tiene que ser un día real, con formato YYYY-MM-DD.' }, { status: 400 });
    }

    const [fila] = await db.insert(prestamosPersonales).values({
      usuarioId,
      persona,
      concepto: texto(b?.concepto),
      monto: String(monto),
      moneda: b?.moneda === 'USD' ? 'USD' : 'ARS',
      fecha: String(b.fecha),
      notas: texto(b?.notas),
    }).returning({ id: prestamosPersonales.id });

    return NextResponse.json({ id: fila.id });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

/** Editar el prestamo, o marcarlo como dado por perdido. */
export async function PATCH(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  const persona = texto(b.persona);
  const monto = numero(b.monto, 0.01);
  if (!persona) return NextResponse.json({ error: 'Poné a quién le prestaste.' }, { status: 400 });
  if (!monto) return NextResponse.json({ error: 'El monto tiene que ser mayor a cero.' }, { status: 400 });
  if (!fechaValida(String(b.fecha))) {
    return NextResponse.json({ error: 'La fecha tiene que ser un día real, con formato YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const [fila] = await db.update(prestamosPersonales).set({
      persona,
      concepto: texto(b.concepto),
      monto: String(monto),
      moneda: b.moneda === 'USD' ? 'USD' : 'ARS',
      fecha: String(b.fecha),
      perdonado: Boolean(b.perdonado),
      notas: texto(b.notas),
    }).where(and(eq(prestamosPersonales.usuarioId, usuarioId), eq(prestamosPersonales.id, String(b.id))))
      .returning({ id: prestamosPersonales.id });

    if (!fila) return NextResponse.json({ error: 'No se encontró ese préstamo.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const entidad = url.searchParams.get('entidad');
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  try {
    // Borrar el prestamo se lleva sus devoluciones por la FK en cascada.
    if (entidad === 'devolucion') await db.delete(devoluciones).where(eq(devoluciones.id, id));
    else await db.delete(prestamosPersonales).where(and(eq(prestamosPersonales.usuarioId, usuarioId), eq(prestamosPersonales.id, id)));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
