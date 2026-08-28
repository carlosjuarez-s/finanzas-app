import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gastos, consumos, salaries, statements } from '@/db/schema';
import { guardarCierres, periodoSiguiente } from '@/lib/cierre';
import { CATEGORIAS } from '@/lib/prompts';
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
      if (monto === null) return NextResponse.json({ error: 'El monto tiene que ser un numero mayor o igual a cero.' }, { status: 400 });

      const categoria = typeof body.categoria === 'string' && (CATEGORIAS as readonly string[]).includes(body.categoria)
        ? body.categoria : 'Otros';

      const [fila] = await db.update(gastos)
        .set({
          concepto: String(body.concepto ?? '').trim() || 'Gasto sin descripcion',
          categoria, montoArs: String(monto), corregido: true,
        })
        .where(eq(gastos.id, id))
        .returning({ periodo: gastos.periodo });

      if (!fila) return NextResponse.json({ error: 'No se encontro ese gasto.' }, { status: 404 });
      await recalcular(usuarioId, [fila.periodo]);
      return NextResponse.json({ ok: true });
    }

    if (entidad === 'consumo') {
      const monto = numero(body.montoArs);
      if (monto === null) return NextResponse.json({ error: 'El monto tiene que ser un numero mayor o igual a cero.' }, { status: 400 });

      const categoria = typeof body.categoria === 'string' && (CATEGORIAS as readonly string[]).includes(body.categoria)
        ? body.categoria : 'Otros';

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
          categoria, montoArs: String(monto), corregido: true,
        })
        .where(eq(consumos.id, id));

      // Corregir una linea no cambia el total del resumen, que se toma del
      // "TOTAL A PAGAR" del PDF: solo se mueve el desglose por categoria.
      const st = padre;
      if (st) await recalcular(usuarioId, [st.periodo]);
      return NextResponse.json({ ok: true });
    }

    if (entidad === 'sueldo') {
      const neto = numero(body.netoArs);
      if (neto === null) return NextResponse.json({ error: 'El neto tiene que ser un numero mayor o igual a cero.' }, { status: 400 });

      const [fila] = await db.update(salaries)
        .set({ netoArs: String(neto), corregido: true })
        .where(eq(salaries.id, id))
        .returning({ periodo: salaries.periodo });

      if (!fila) return NextResponse.json({ error: 'No se encontro ese recibo.' }, { status: 404 });
      // El sueldo de un mes paga los consumos del siguiente: dos cierres cambian.
      await recalcular(usuarioId, [fila.periodo, periodoSiguiente(fila.periodo)]);
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
