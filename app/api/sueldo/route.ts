import { NextRequest, NextResponse } from 'next/server';
import { validar } from '@/lib/sueldo';
import { guardarSueldoManual } from '@/lib/guardar';
import { guardarCierres, periodoSiguiente } from '@/lib/cierre';
import { idUsuarioActual } from '@/lib/usuario';
import { mensajeDeError } from '@/lib/errores';

// Cargar el sueldo a mano. Existe porque el recibo no alcanza: la parte en
// dolares se cobra por fuera y ningun PDF la trae.

export async function PUT(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const v = validar(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    await guardarSueldoManual(usuarioId, v.sueldo);
    // El sueldo de un mes paga los consumos del siguiente: cambian dos cierres.
    await guardarCierres(usuarioId, [v.sueldo.periodo, periodoSiguiente(v.sueldo.periodo)]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
