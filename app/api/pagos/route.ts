import { NextRequest, NextResponse } from 'next/server';
import { marcarPago } from '@/lib/pagos';
import { idUsuarioActual } from '@/lib/usuario';
import { mensajeDeError } from '@/lib/errores';

export async function PATCH(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);

  const tipo = b?.tipo === 'tarjeta' ? 'tarjeta' : 'gasto';
  const id = typeof b?.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  try {
    const ok = await marcarPago(usuarioId, tipo, id, Boolean(b?.pagado));
    if (!ok) return NextResponse.json({ error: 'No se encontró eso.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
