import { NextResponse } from 'next/server';
import { guardarCierres } from '@/lib/cierre';
import { idUsuarioActual } from '@/lib/usuario';
import { mensajeDeError } from '@/lib/errores';

// Recalcula TODOS los cierres.
//
// El cierre de un mes es derivado: sale de los sueldos, resumenes y gastos de
// ese mes. Cuando los datos entran por la app, cada endpoint recalcula lo que
// toco. Cuando entran por afuera —un import de una planilla pegado en el SQL
// editor— no hay nada que dispare el recalculo, y el historico queda vacio
// aunque los datos esten.

export const maxDuration = 60;

export async function POST() {
  const usuarioId = await idUsuarioActual();
  try {
    const periodos = await guardarCierres(usuarioId);
    return NextResponse.json({ ok: true, periodos: periodos.length });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
