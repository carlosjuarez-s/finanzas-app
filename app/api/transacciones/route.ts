import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transacciones, eventosActivo } from '@/db/schema';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const numero = (v: unknown, min = 0): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : null;
};

export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);

  // Un evento de activo (cambio de ratio, split) no es una operacion tuya:
  // entra por la misma ruta pero va a otra tabla.
  if (b?.entidad === 'evento') {
    const factor = numero(b.factor);
    if (!factor || factor <= 0) return NextResponse.json({ error: 'El factor tiene que ser mayor a cero.' }, { status: 400 });
    if (!FECHA.test(String(b.fecha))) return NextResponse.json({ error: 'La fecha tiene que ser YYYY-MM-DD.' }, { status: 400 });

    const [fila] = await db.insert(eventosActivo).values({
      usuarioId,
      activo: String(b.activo ?? '').trim().toUpperCase(),
      fecha: b.fecha,
      tipo: b.tipo === 'SPLIT' || b.tipo === 'DIVIDENDO_ACCIONES' ? b.tipo : 'RATIO',
      factor: String(factor),
      notas: typeof b.notas === 'string' && b.notas.trim() ? b.notas.trim() : null,
    }).returning({ id: eventosActivo.id });
    return NextResponse.json({ id: fila.id });
  }

  const cantidad = numero(b?.cantidad);
  const precio = numero(b?.precioUnitario);
  const activo = String(b?.activo ?? '').trim().toUpperCase();
  const moneda = b?.moneda === 'ARS' ? 'ARS' : 'USD';

  if (!activo) return NextResponse.json({ error: 'Falta el activo.' }, { status: 400 });
  if (!FECHA.test(String(b?.fecha))) return NextResponse.json({ error: 'La fecha tiene que ser YYYY-MM-DD.' }, { status: 400 });
  if (!cantidad || cantidad <= 0) return NextResponse.json({ error: 'La cantidad tiene que ser mayor a cero.' }, { status: 400 });
  if (precio === null) return NextResponse.json({ error: 'El precio no puede ser negativo.' }, { status: 400 });

  // Sin el tipo de cambio del dia, una operacion en pesos no se puede medir en
  // dolares, que es la unidad de toda la app. Se pide acá y no despues.
  const tc = numero(b?.tipoCambioDia, 0.0001);
  if (moneda === 'ARS' && !tc) {
    return NextResponse.json(
      { error: 'Una operacion en pesos necesita el tipo de cambio de ese dia para poder medir la ganancia en dolares.' },
      { status: 400 },
    );
  }

  try {
    const [fila] = await db.insert(transacciones).values({
      usuarioId,
      activo,
      clase: String(b?.clase ?? 'CRIPTO'),
      tipo: b?.tipo === 'VENTA' ? 'VENTA' : 'COMPRA',
      fecha: b.fecha,
      cantidad: String(cantidad),
      precioUnitario: String(precio),
      moneda,
      tipoCambioDia: moneda === 'ARS' ? String(tc) : null,
      comision: String(numero(b?.comision) ?? 0),
      origen: 'MANUAL',
    }).returning({ id: transacciones.id });
    return NextResponse.json({ id: fila.id });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

/**
 * Corregir una operacion: el precio de entrada, la cantidad, la fecha, o
 * completar el tipo de cambio que el export del broker no trae.
 */
export async function PATCH(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  const cantidad = numero(b.cantidad);
  const precio = numero(b.precioUnitario);
  const moneda = b.moneda === 'ARS' ? 'ARS' : 'USD';
  const tc = numero(b.tipoCambioDia, 0.0001);

  if (!cantidad || cantidad <= 0) return NextResponse.json({ error: 'La cantidad tiene que ser mayor a cero.' }, { status: 400 });
  if (precio === null) return NextResponse.json({ error: 'El precio no puede ser negativo.' }, { status: 400 });
  if (!FECHA.test(String(b.fecha))) return NextResponse.json({ error: 'La fecha tiene que ser YYYY-MM-DD.' }, { status: 400 });
  if (moneda === 'ARS' && !tc) {
    return NextResponse.json(
      { error: 'Una operacion en pesos necesita el tipo de cambio de ese dia para medir la ganancia en dolares.' },
      { status: 400 },
    );
  }

  try {
    const [fila] = await db.update(transacciones)
      .set({
        cantidad: String(cantidad),
        precioUnitario: String(precio),
        fecha: b.fecha,
        moneda,
        tipoCambioDia: moneda === 'ARS' ? String(tc) : null,
        comision: String(numero(b.comision) ?? 0),
        // Queda marcada como tocada a mano, pero conserva refExterna. Borrarla
        // haria que al reimportar el mismo CSV o el historial de Binance la
        // operacion entre de nuevo como si fuera otra, duplicando el activo.
        // La correccion ya esta protegida por el onConflictDoNothing del
        // importador: con la ref intacta, la reimportacion la reconoce y no la
        // toca.
        origen: 'MANUAL',
      })
      .where(and(eq(transacciones.usuarioId, usuarioId), eq(transacciones.id, String(b.id))))
      .returning({ id: transacciones.id });

    if (!fila) return NextResponse.json({ error: 'No se encontro esa operacion.' }, { status: 404 });
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

  if (entidad === 'evento') await db.delete(eventosActivo).where(and(eq(eventosActivo.usuarioId, usuarioId), eq(eventosActivo.id, id)));
  else await db.delete(transacciones).where(and(eq(transacciones.usuarioId, usuarioId), eq(transacciones.id, id)));

  return NextResponse.json({ ok: true });
}
