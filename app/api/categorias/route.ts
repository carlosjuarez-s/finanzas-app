import { NextRequest, NextResponse } from 'next/server';
import { leerCategorias, guardarCategorias } from '@/lib/categorias';
import { idUsuarioActual } from '@/lib/usuario';
import { mensajeDeError } from '@/lib/errores';

export async function GET() {
  const usuarioId = await idUsuarioActual();
  return NextResponse.json({ categorias: await leerCategorias(usuarioId) });
}

export async function PUT(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const b = await req.json().catch(() => null);
  try {
    return NextResponse.json({ categorias: await guardarCategorias(usuarioId, b?.categorias) });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 400 });
  }
}
