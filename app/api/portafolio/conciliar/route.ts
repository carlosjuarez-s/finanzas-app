import { NextRequest, NextResponse } from 'next/server';
import { extraerPortafolio, interpretarPortafolioTexto, faltaProveedor } from '@/lib/extract';
import { aplicarInstrucciones, clavePlataforma, ultimasFotos, type Cambio } from '@/lib/conciliar';
import {
  armarPropuesta, cargarFotos, conAnterior, validarInstrucciones, validarTenencias,
} from '@/lib/conciliar-servidor';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';
import { esArchivoBinario, type Documento } from '@/lib/tipos';

export const maxDuration = 120;

// Vista previa: NO escribe nada. Recibe una o varias capturas, una correccion
// escrita, o una foto ya leida a la que se le cambio la cuenta, y devuelve que
// cambiaria. Escribir es otra ruta, y solo despues de que la persona confirma.
export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  try {
    const fotos = await cargarFotos(usuarioId);

    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const sinProveedor = faltaProveedor();
      if (sinProveedor) return NextResponse.json({ error: sinProveedor }, { status: 400 });

      const form = await req.formData();
      const archivos = form.getAll('fotos').filter((f): f is File => f instanceof File);
      if (!archivos.length) return NextResponse.json({ error: 'Subí al menos una captura.' }, { status: 400 });
      if (archivos.length > 8) return NextResponse.json({ error: 'Máximo 8 capturas por vez.' }, { status: 400 });
      const malos = archivos.filter(f => !esArchivoBinario(f.type));
      if (malos.length) {
        return NextResponse.json({ error: `Solo capturas o PDF: ${malos.map(f => f.name).join(', ')} no se puede leer.` }, { status: 400 });
      }

      const docs: Documento[] = await Promise.all(archivos.map(async f => ({
        base64: Buffer.from(await f.arrayBuffer()).toString('base64'), mediaType: f.type,
      })));

      // Cada captura por separado: pueden ser de cuentas distintas (el banco y
      // Binance), y leidas juntas el modelo las mezcla en una sola cuenta.
      const leidas = await Promise.all(docs.map(d => extraerPortafolio([d])));

      // Varias capturas de la MISMA cuenta (scrolleando la lista) se vuelven a
      // leer juntas: por separado, un activo que aparece en las dos se sumaria
      // dos veces. Juntas, el modelo ve que es el mismo.
      const grupos = new Map<string, number[]>();
      leidas.forEach((l, i) => {
        const k = clavePlataforma(l?.plataforma ?? '');
        grupos.set(k, [...(grupos.get(k) ?? []), i]);
      });
      const porCuenta = await Promise.all([...grupos.values()].map(async idx =>
        idx.length === 1 ? leidas[idx[0]] : extraerPortafolio(idx.map(i => docs[i]))));

      const errores: string[] = [];
      const cambios: Cambio[] = porCuenta.map(l => {
        const { tenencias, descartadas } = validarTenencias(l?.positions);
        const nombre = (l?.plataforma ?? '').trim() || 'Sin identificar';
        if (descartadas) errores.push(`${nombre}: ${descartadas} ${descartadas === 1 ? 'línea no se pudo leer' : 'líneas no se pudieron leer'} y quedaron afuera.`);
        if (!tenencias.length) errores.push(`${nombre}: no se leyó ninguna tenencia. Si la cuenta quedó vacía, decilo por texto.`);
        return conAnterior(fotos, nombre, tenencias);
      }).filter(c => c.nueva.length);

      return NextResponse.json(await armarPropuesta(usuarioId, fotos, cambios, {}, errores));
    }

    const body = await req.json().catch(() => null);

    // Una foto ya leida, reasignada a otra cuenta: no hace falta volver a
    // pasarla por el modelo, solo compararla contra otra foto anterior.
    if (body?.plataforma && Array.isArray(body?.tenencias)) {
      const { tenencias } = validarTenencias(body.tenencias);
      const plataforma = String(body.plataforma).trim().slice(0, 60);
      if (!plataforma) return NextResponse.json({ error: 'Falta el nombre de la cuenta.' }, { status: 400 });
      return NextResponse.json(await armarPropuesta(usuarioId, fotos, [conAnterior(fotos, plataforma, tenencias)]));
    }

    const descripcion = String(body?.texto ?? '').trim();
    if (descripcion.length < 4) return NextResponse.json({ error: 'Escribí un poco más para poder interpretarlo.' }, { status: 400 });
    if (descripcion.length > 2000) return NextResponse.json({ error: 'El texto es demasiado largo (máx. 2000 caracteres).' }, { status: 400 });
    const sinProveedor = faltaProveedor();
    if (sinProveedor) return NextResponse.json({ error: sinProveedor }, { status: 400 });

    const { resultado, hallazgos } = await interpretarPortafolioTexto(descripcion);
    const { instrucciones, descartadas } = validarInstrucciones(resultado?.instrucciones);
    if (!instrucciones.length) {
      return NextResponse.json({
        error: (typeof resultado?.motivo === 'string' && resultado.motivo) || 'No se entendió qué cambiar.',
      }, { status: 422 });
    }
    const r = aplicarInstrucciones(
      // Las ultimas fotos, no todas: la correccion es sobre lo que tenes hoy.
      ultimasFotos(fotos), instrucciones,
    );
    const errores = [...r.errores];
    if (descartadas) errores.push(`${descartadas} ${descartadas === 1 ? 'parte del texto no se entendió' : 'partes del texto no se entendieron'}.`);
    const propuesta = await armarPropuesta(usuarioId, fotos, r.cambios, r.precios, errores, true);
    return NextResponse.json({ ...propuesta, hallazgos });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
