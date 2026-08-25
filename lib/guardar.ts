import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, consumos, salaries, portfolioSnapshots, positions } from '@/db/schema';
import type { StatementData, SalaryData, PortfolioData } from './tipos';

// Insercion compartida entre el sync de Drive y el upload manual. El fileId es
// la identidad del documento de origen: el id de Drive, o "upload:<hash>" para
// los archivos subidos a mano. En los dos casos el unique de la columna es lo
// que evita cargar dos veces el mismo resumen.

export async function guardarStatement(fileId: string, data: StatementData) {
  const [st] = await db.insert(statements).values({
    fileId, card: data.card, periodo: data.periodo,
    vencimiento: data.vencimiento ? new Date(data.vencimiento) : null,
    totalArs: String(data.totalArs), totalUsd: String(data.totalUsd),
    percepArs: String(data.percepArs), raw: data,
  }).returning({ id: statements.id });

  if (data.consumos.length) {
    await db.insert(consumos).values(data.consumos.map(c => ({
      statementId: st.id, fecha: c.fecha, comercio: c.comercio,
      categoria: c.categoria, cuota: c.cuota,
      montoArs: String(c.montoArs), montoUsd: String(c.montoUsd),
    })));
  }
  return { id: st.id, periodo: data.periodo };
}

// Devuelve cuantos recibos entraron: un PDF puede traer varios meses.
export async function guardarSalary(fileId: string, data: SalaryData) {
  for (const r of data.recibos) {
    await db.insert(salaries)
      .values({ periodo: r.periodo, netoArs: String(r.netoArs), fileId })
      .onConflictDoUpdate({
        target: salaries.periodo,
        set: { netoArs: String(r.netoArs), fileId },
      });
  }
  return { cantidad: data.recibos.length, periodos: data.recibos.map(r => r.periodo) };
}

export async function guardarPortfolio(periodo: string, data: PortfolioData) {
  const [snap] = await db.insert(portfolioSnapshots)
    .values({
      periodo, plataforma: data.plataforma,
      totalUsd: data.totalUsd != null ? String(data.totalUsd) : null,
      totalArs: data.totalArs != null ? String(data.totalArs) : null,
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.periodo, portfolioSnapshots.plataforma],
      set: {
        totalUsd: data.totalUsd != null ? String(data.totalUsd) : null,
        totalArs: data.totalArs != null ? String(data.totalArs) : null,
      },
    })
    .returning({ id: portfolioSnapshots.id });

  // Las posiciones se reemplazan enteras: un snapshot es una foto del momento,
  // no un acumulado, y mezclarlo con la foto anterior duplicaria tenencias.
  await db.delete(positions).where(eq(positions.snapshotId, snap.id));
  if (data.positions.length) {
    await db.insert(positions).values(data.positions.map(p => ({
      snapshotId: snap.id, activo: p.activo, clase: p.clase,
      cantidad: String(p.cantidad),
      valorUsd: p.valorUsd != null ? String(p.valorUsd) : null,
      valorArs: p.valorArs != null ? String(p.valorArs) : null,
    })));
  }
  return { id: snap.id, posiciones: data.positions.length };
}
