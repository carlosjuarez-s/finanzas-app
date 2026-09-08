import { NextRequest, NextResponse } from 'next/server';
import {
  validar, crear, borrar, guardarIndices, leerIndices, parsearIndice,
  desdeUnGasto, yaEsFijo, listar,
} from '@/lib/recurrentes';
import { periodoValido } from '@/lib/formato';
import { idUsuarioActual } from '@/lib/usuario';
import { mensajeDeError } from '@/lib/errores';

// Gastos fijos declarados. No tocan ningun cierre: el cierre son meses que ya
// pasaron con datos reales, y esto es lo que va a pasar. Solo alimenta la
// estimacion, que no se guarda.

export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const v = validar(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    await crear(usuarioId, v.valor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

/**
 * Marcar un gasto ya cargado como fijo, de un toque.
 *
 * Va aparte del POST porque no recibe un gasto fijo: recibe uno cargado y le
 * pone los defaults. Y porque acá hay que chequear que no exista ya, cosa que
 * el formulario no necesita —ahí la persona ve la lista mientras escribe.
 */
export async function PATCH(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);

  const concepto = String(b?.concepto ?? '').trim();
  const periodo = String(b?.periodo ?? '');
  if (!concepto) return NextResponse.json({ error: 'Falta el concepto.' }, { status: 400 });
  if (!periodoValido(periodo)) return NextResponse.json({ error: 'Falta el mes.' }, { status: 400 });

  try {
    const fijos = await listar(usuarioId);
    if (yaEsFijo(fijos, concepto)) {
      return NextResponse.json({ error: `«${concepto}» ya está cargado como gasto fijo.` }, { status: 409 });
    }

    const v = validar(desdeUnGasto({
      concepto,
      categoria: String(b?.categoria ?? 'Otros'),
      montoArs: Number(b?.montoArs ?? 0),
      montoUsd: Number(b?.montoUsd ?? 0),
    }, periodo));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await crear(usuarioId, v.valor);
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
    const ok = await borrar(usuarioId, id);
    if (!ok) return NextResponse.json({ error: 'No se encontró ese gasto fijo.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

/** Cargar o corregir un indice, escrito a mano. La app no lo sale a buscar. */
export async function PUT(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);
  const nombre = String(b?.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre del índice.' }, { status: 400 });

  const leido = parsearIndice(String(b?.texto ?? ''));
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });

  try {
    const todos = await leerIndices(usuarioId);
    await guardarIndices(usuarioId, { ...todos, [nombre]: leido.indice });
    return NextResponse.json({ ok: true, meses: Object.keys(leido.indice).length });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
