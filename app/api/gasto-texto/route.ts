import { NextRequest, NextResponse } from 'next/server';
import { interpretarTexto, faltaProveedor } from '@/lib/extract';
import { guardarGasto, guardarCuotas } from '@/lib/guardar';
import { guardarCierres } from '@/lib/cierre';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

export const maxDuration = 120;

// Carga de un gasto describiendolo: "pague 85 lucas de alquiler en septiembre".
// A diferencia de una foto, aca la redaccion de PII protege de verdad, porque el
// texto se limpia antes de salir hacia el proveedor.
export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const sinProveedor = faltaProveedor();
  if (sinProveedor) return NextResponse.json({ error: sinProveedor }, { status: 400 });

  const body = await req.json().catch(() => null);
  const descripcion = String(body?.descripcion ?? '').trim();
  if (descripcion.length < 4) {
    return NextResponse.json({ error: 'Escribi un poco mas para poder interpretarlo.' }, { status: 400 });
  }
  // Un texto enorme es casi siempre un pegado accidental, y se cobra por token.
  if (descripcion.length > 2000) {
    return NextResponse.json({ error: 'El texto es demasiado largo (max 2000 caracteres).' }, { status: 400 });
  }

  try {
    const { resultado, hallazgos } = await interpretarTexto(descripcion);

    // Una compra en cuotas no es un gasto de este mes: es un compromiso
    // repartido. Va al plan de cuotas y desde ahi suma a cada mes que toca.
    if (resultado.tipo === 'CUOTAS') {
      const plan = await guardarCuotas(usuarioId, resultado.datos);
      try {
        await guardarCierres(usuarioId);
      } catch (e) {
        return NextResponse.json({
          estado: 'cuotas', plan, hallazgos,
          historico: `El plan se guardo, pero fallo el recalculo del historico. ${mensajeDeError(e)}`,
        });
      }
      return NextResponse.json({ estado: 'cuotas', plan, hallazgos });
    }

    if (resultado.tipo !== 'GASTO') {
      return NextResponse.json({
        estado: 'desconocido',
        detalle: resultado.datos?.motivo ?? 'No se entendio que gasto es.',
        hallazgos,
      });
    }

    const { periodo, monto } = await guardarGasto(usuarioId, resultado.datos, 'TEXTO');
    try {
      await guardarCierres(usuarioId, [periodo]);
    } catch (e) {
      return NextResponse.json({
        estado: 'cargado', gasto: resultado.datos, hallazgos,
        historico: `El gasto se guardo, pero fallo el recalculo del historico. ${mensajeDeError(e)}`,
      });
    }

    return NextResponse.json({ estado: 'cargado', gasto: { ...resultado.datos, montoArs: monto }, hallazgos });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
