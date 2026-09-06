import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gastos, consumos, statements } from '@/db/schema';
import { guardarCierres } from '@/lib/cierre';
import { leerCategorias, encajar } from '@/lib/categorias';
import { mensajeDeError } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';

// Correcciones a mano de lo que interpreto el modelo. Todo lo que se toca marca
// `corregido`, para saber despues en que datos confiar.

const numero = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// El cierre se recalcula siempre despues de tocar algo: si no, la correccion se
// ve en la lista pero el ahorro del mes sigue con el numero viejo.
async function recalcular(usuarioId: string, periodos: string[]) {
  await guardarCierres(usuarioId, [...new Set(periodos)]);
}

export async function PATCH(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const body = await req.json().catch(() => null);
  const { entidad, id } = body ?? {};
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });
  }

  try {
    if (entidad === 'gasto') {
      const monto = numero(body.montoArs);
      const usd = numero(body.montoUsd ?? 0);
      if (monto === null || usd === null) return NextResponse.json({ error: 'El monto tiene que ser un numero mayor o igual a cero.' }, { status: 400 });
      // Cero en las dos monedas no es un gasto de cero: es un gasto sin monto.
      if (monto === 0 && usd === 0) return NextResponse.json({ error: 'Poné el monto en pesos, en dólares, o en las dos.' }, { status: 400 });

      // La categoria se valida contra las del usuario, no contra una lista fija.
      const categoria = encajar(body.categoria, await leerCategorias(usuarioId));

      const [fila] = await db.update(gastos)
        .set({
          concepto: String(body.concepto ?? '').trim() || 'Gasto sin descripcion',
          categoria, montoArs: String(monto), montoUsd: String(usd), corregido: true,
        })
        .where(eq(gastos.id, id))
        .returning({ periodo: gastos.periodo });

      if (!fila) return NextResponse.json({ error: 'No se encontro ese gasto.' }, { status: 404 });
      await recalcular(usuarioId, [fila.periodo]);
      return NextResponse.json({ ok: true });
    }

    if (entidad === 'consumo') {
      const monto = numero(body.montoArs);
      const usd = numero(body.montoUsd ?? 0);
      if (monto === null || usd === null) return NextResponse.json({ error: 'El monto tiene que ser un numero mayor o igual a cero.' }, { status: 400 });
      if (monto === 0 && usd === 0) return NextResponse.json({ error: 'Poné el monto en pesos, en dólares, o en las dos.' }, { status: 400 });

      // La categoria se valida contra las del usuario, no contra una lista fija.
      const categoria = encajar(body.categoria, await leerCategorias(usuarioId));

      // `consumos` no tiene dueño propio: cuelga de su statement. Se verifica
      // el padre ANTES de escribir, porque un update que solo filtra por id
      // dejaria corregir el consumo de otra persona conociendo el id.
      const [padre] = await db.select({ id: statements.id, periodo: statements.periodo })
        .from(statements)
        .innerJoin(consumos, eq(consumos.statementId, statements.id))
        .where(and(eq(statements.usuarioId, usuarioId), eq(consumos.id, id)));

      if (!padre) return NextResponse.json({ error: 'No se encontro ese consumo.' }, { status: 404 });

      await db.update(consumos)
        .set({
          comercio: String(body.comercio ?? '').trim() || 'Sin identificar',
          categoria, montoArs: String(monto), montoUsd: String(usd), corregido: true,
        })
        .where(eq(consumos.id, id));

      // Corregir una linea no cambia el total del resumen, que se toma del
      // "TOTAL A PAGAR" del PDF: solo se mueve el desglose por categoria.
      const st = padre;
      if (st) await recalcular(usuarioId, [st.periodo]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Entidad desconocida: ${entidad}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const url = new URL(req.url);
  const entidad = url.searchParams.get('entidad');
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

  try {
    // Solo se borran gastos sueltos: un consumo de tarjeta es parte de un
    // resumen y borrarlo dejaria el desglose sin cuadrar con el total del PDF.
    if (entidad !== 'gasto') {
      return NextResponse.json(
        { error: 'Solo se pueden borrar gastos sueltos. Un consumo de tarjeta se corrige, no se elimina.' },
        { status: 400 },
      );
    }
    const [fila] = await db.delete(gastos).where(eq(gastos.id, id)).returning({ periodo: gastos.periodo });
    if (!fila) return NextResponse.json({ error: 'No se encontro ese gasto.' }, { status: 404 });
    await recalcular(usuarioId, [fila.periodo]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
