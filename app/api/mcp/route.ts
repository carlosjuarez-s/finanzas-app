import { NextRequest, NextResponse } from 'next/server';
import { autorizar } from '@/lib/mcp-token';
import { despachar, nombresDeHerramientas } from '@/lib/mcp';

/**
 * Servidor MCP sobre las finanzas, de solo lectura.
 *
 * Habla JSON-RPC 2.0 sobre HTTP POST, que es el transporte "streamable HTTP"
 * del protocolo. Esta ruta se ocupa del transporte y de la autenticacion; el
 * despacho vive en `lib/mcp.ts`, que se prueba sin base ni servidor.
 */

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null);
  const id = cuerpo?.id ?? null;

  const permiso = await autorizar(req.headers.get('authorization'));
  if (!permiso.ok) {
    // 401 y no un error JSON-RPC comun: el cliente tiene que saber que es de
    // autenticacion para pedir credenciales, no reintentar la llamada.
    return NextResponse.json(
      { jsonrpc: '2.0', id, error: { code: -32001, message: permiso.motivo } },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="finanzas"' } },
    );
  }

  const r = await despachar(permiso.usuarioId, cuerpo);

  if (r.tipo === 'sin-contenido') return new NextResponse(null, { status: 202 });
  if (r.tipo === 'error') {
    return NextResponse.json(
      { jsonrpc: '2.0', id, error: { code: r.code, message: r.message } },
      { status: r.status ?? 200 },
    );
  }
  return NextResponse.json({ jsonrpc: '2.0', id, result: r.result });
}

/** Un GET explica como conectarse, en vez de devolver un 405 mudo. */
export async function GET() {
  return NextResponse.json({
    servidor: 'finanzas',
    transporte: 'JSON-RPC 2.0 sobre HTTP POST',
    autenticacion: 'Authorization: Bearer <tu-email>:<MCP_TOKEN>',
    herramientas: nombresDeHerramientas(),
    soloLectura: true,
  });
}
