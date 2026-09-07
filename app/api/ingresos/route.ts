import { NextRequest, NextResponse } from 'next/server';
import { validar, crear, borrar } from '@/lib/ingresos';
import { guardarCierres, periodoSiguiente } from '@/lib/cierre';
import { idUsuarioActual } from '@/lib/usuario';
import { mensajeDeError } from '@/lib/errores';

// Plata que entra y no es sueldo.

export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const v = validar(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    await crear(usuarioId, v.ingreso);
    // Igual que el sueldo: el ingreso de un mes tambien afecta el cierre del
    // siguiente, que es el que paga los consumos de este.
    await guardarCierres(usuarioId, [v.ingreso.periodo, periodoSiguiente(v.ingreso.periodo)]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  try {
    // El borrado filtra por usuario ademas del id: un id no autoriza nada.
    const periodo = await borrar(usuarioId, id);
    if (!periodo) return NextResponse.json({ error: 'No se encontró ese ingreso.' }, { status: 404 });
    await guardarCierres(usuarioId, [periodo, periodoSiguiente(periodo)]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
