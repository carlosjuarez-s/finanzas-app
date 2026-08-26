import { NextRequest, NextResponse } from 'next/server';
import { crearConexion, borrarConexion, listarConexiones } from '@/lib/conexiones';
import { esPlataforma, PLATAFORMAS } from '@/lib/plataformas';
import { bovedaConfigurada } from '@/lib/boveda';
import { mensajeDeError } from '@/lib/errores';

// El middleware ya exige el Basic Auth de la app en estas rutas.

export async function GET() {
  return NextResponse.json({ conexiones: await listarConexiones() });
}

export async function POST(req: NextRequest) {
  if (!bovedaConfigurada()) {
    return NextResponse.json(
      { error: 'Falta BOVEDA_CLAVE_1 en el entorno: sin esa clave no se pueden guardar credenciales cifradas.' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  // En una const aparte para que el type guard estreche el tipo: sobre
  // body?.plataforma, que es any, el narrowing no sobrevive a la linea.
  const plataforma: unknown = body?.plataforma;
  if (!esPlataforma(plataforma)) {
    return NextResponse.json({ error: 'Plataforma desconocida.' }, { status: 400 });
  }

  // Solo se toman los campos que la plataforma declara: asi no entra basura
  // extra al secreto cifrado.
  const credencial: Record<string, string> = {};
  for (const campo of PLATAFORMAS[plataforma].campos) {
    credencial[campo.nombre] = String(body?.credencial?.[campo.nombre] ?? '').trim();
  }

  try {
    const conexion = await crearConexion(plataforma, String(body?.etiqueta ?? ''), credencial);
    // Devuelve el tipo visible, que no incluye el secreto.
    return NextResponse.json({ conexion });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });
  await borrarConexion(id);
  return NextResponse.json({ ok: true });
}
