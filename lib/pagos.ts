import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gastos, statements } from '@/db/schema';
import { consolidar } from './bimoneda';

/**
 * Que se pago y que falta pagar.
 *
 * Cargar un gasto y pagarlo son dos momentos distintos: la boleta de luz entra
 * cuando llega y se paga dias despues. Sin ese estado, "cuanto me falta pagar
 * este mes" no se puede responder, que es justo la pregunta con la que uno mira
 * el mes en curso.
 *
 * Lo pendiente NO cambia el cierre. El gasto ya esta imputado al mes lo hayas
 * pagado o no: lo que cambia es tu caja, no tu gasto. Confundir las dos cosas
 * haria que pagar tarde parezca gastar menos.
 */

export type Pendiente = {
  id: string;
  tipo: 'gasto' | 'tarjeta';
  concepto: string;
  montoArs: number;
  montoUsd: number;
  /** El monto consolidado en pesos, o null si hay USD y no hay tipo de cambio. */
  totalArs: number | null;
};

export type EstadoDePagos = {
  pendientes: Pendiente[];
  pagados: number;
  /** Suma de lo pendiente, en pesos. Null si algo no se pudo convertir. */
  faltaPagarArs: number | null;
};

export async function estadoDePagos(
  usuarioId: string, periodo: string, tipoCambio: number | null,
): Promise<EstadoDePagos> {
  const [sueltos, resumenes] = await Promise.all([
    db.select({
      id: gastos.id, concepto: gastos.concepto, pagado: gastos.pagado,
      montoArs: gastos.montoArs, montoUsd: gastos.montoUsd,
    }).from(gastos).where(and(eq(gastos.usuarioId, usuarioId), eq(gastos.periodo, periodo))),

    db.select({
      id: statements.id, card: statements.card, pagado: statements.pagado,
      totalArs: statements.totalArs, totalUsd: statements.totalUsd,
    }).from(statements).where(and(eq(statements.usuarioId, usuarioId), eq(statements.periodo, periodo))),
  ]);

  const filas: (Pendiente & { pagado: boolean })[] = [
    ...sueltos.map(g => ({
      id: g.id, tipo: 'gasto' as const, concepto: g.concepto, pagado: g.pagado,
      montoArs: Number(g.montoArs), montoUsd: Number(g.montoUsd),
      totalArs: consolidar({ ars: Number(g.montoArs), usd: Number(g.montoUsd) }, tipoCambio).totalArs,
    })),
    ...resumenes.map(s => ({
      id: s.id, tipo: 'tarjeta' as const, concepto: `Tarjeta ${s.card}`, pagado: s.pagado,
      montoArs: Number(s.totalArs), montoUsd: Number(s.totalUsd),
      totalArs: consolidar({ ars: Number(s.totalArs), usd: Number(s.totalUsd) }, tipoCambio).totalArs,
    })),
  ];

  const pendientes = filas.filter(f => !f.pagado);

  // Si alguno no se pudo convertir, el total queda en null: un "falta pagar"
  // que se come una linea entera es peor que no mostrar nada.
  const incompleto = pendientes.some(p => p.totalArs === null);

  return {
    pendientes: pendientes.map(({ pagado: _, ...p }) => p),
    pagados: filas.length - pendientes.length,
    faltaPagarArs: incompleto ? null : pendientes.reduce((s, p) => s + (p.totalArs ?? 0), 0),
  };
}

/** Marca o desmarca. Devuelve false si esa fila no era del usuario. */
export async function marcarPago(
  usuarioId: string, tipo: 'gasto' | 'tarjeta', id: string, pagado: boolean,
): Promise<boolean> {
  const pagadoEn = pagado ? new Date().toISOString().slice(0, 10) : null;

  if (tipo === 'tarjeta') {
    const [f] = await db.update(statements).set({ pagado, pagadoEn })
      .where(and(eq(statements.usuarioId, usuarioId), eq(statements.id, id)))
      .returning({ id: statements.id });
    return Boolean(f);
  }

  const [f] = await db.update(gastos).set({ pagado, pagadoEn })
    .where(and(eq(gastos.usuarioId, usuarioId), eq(gastos.id, id)))
    .returning({ id: gastos.id });
  return Boolean(f);
}
