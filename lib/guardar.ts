import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, consumos, salaries, portfolioSnapshots, positions } from '@/db/schema';
import type { StatementData, SalaryData, PortfolioData } from './tipos';

// Insercion compartida entre el sync de Drive y el upload manual. El fileId es
// la identidad del documento de origen: el id de Drive, o "upload:<hash>" para
// los archivos subidos a mano. En los dos casos el unique de la columna es lo
// que evita cargar dos veces el mismo resumen.
//
// Todo lo que entra aca lo produjo un modelo: es entrada NO confiable. Un campo
// que falta no puede tumbar el guardado entero, y un numero mal formateado no
// puede terminar como "undefined" en una columna numerica.

function num(v: unknown, porDefecto = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : porDefecto;
  if (typeof v !== 'string') return porDefecto;
  // El prompt pide convertir el formato argentino (1.234,56) pero a veces se
  // cuela igual, y ahi el punto es separador de miles, no decimal.
  const limpio = v.replace(/[^\d,.-]/g, '');
  const n = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio);
  return Number.isFinite(n) ? n : porDefecto;
}

const texto = (v: unknown, porDefecto: string) =>
  typeof v === 'string' && v.trim() ? v.trim() : porDefecto;

// Una fecha invalida rompe el insert entero; sin fecha, la fila igual sirve.
function fecha(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// YYYY-MM. Si el modelo devuelve cualquier otra cosa, el mes no existe y el
// cierre quedaria colgado de un periodo fantasma.
export const periodoValido = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export async function guardarStatement(fileId: string, data: StatementData) {
  if (!periodoValido(data.periodo)) {
    throw new Error(`El periodo extraido no tiene formato YYYY-MM (vino "${data.periodo}").`);
  }

  const [st] = await db.insert(statements).values({
    fileId,
    card: texto(data.card, 'DESCONOCIDA'),
    periodo: data.periodo,
    vencimiento: fecha(data.vencimiento),
    totalArs: String(num(data.totalArs)),
    totalUsd: String(num(data.totalUsd)),
    percepArs: String(num(data.percepArs)),
    raw: data,
  }).returning({ id: statements.id });

  // Puede venir sin consumos: un resumen sin movimientos es raro pero valido, y
  // la suma total ya quedo guardada igual.
  const items = Array.isArray(data.consumos) ? data.consumos : [];
  if (items.length) {
    await db.insert(consumos).values(items.map(c => ({
      statementId: st.id,
      fecha: texto(c?.fecha, ''),
      comercio: texto(c?.comercio, 'Sin identificar'),
      categoria: texto(c?.categoria, 'Sin categoria'),
      cuota: typeof c?.cuota === 'string' ? c.cuota : null,
      montoArs: String(num(c?.montoArs)),
      montoUsd: String(num(c?.montoUsd)),
    })));
  }
  return { id: st.id, periodo: data.periodo, consumos: items.length };
}

// Devuelve cuantos recibos entraron: un PDF puede traer varios meses.
export async function guardarSalary(fileId: string, data: SalaryData) {
  // Un recibo sin periodo valido no se puede asociar a ningun mes: mejor
  // descartarlo que inventar una fila que despues no cuadra con nada.
  const recibos = (Array.isArray(data.recibos) ? data.recibos : [])
    .filter(r => periodoValido(r?.periodo));

  for (const r of recibos) {
    await db.insert(salaries)
      .values({ periodo: r.periodo, netoArs: String(num(r.netoArs)), fileId })
      .onConflictDoUpdate({
        target: salaries.periodo,
        set: { netoArs: String(num(r.netoArs)), fileId },
      });
  }
  return { cantidad: recibos.length, periodos: recibos.map(r => r.periodo) };
}

export async function guardarPortfolio(periodo: string, data: PortfolioData) {
  // null y 0 no son lo mismo: "no muestra valuacion" no es "vale cero".
  const monto = (v: unknown) => (v == null ? null : String(num(v)));

  const [snap] = await db.insert(portfolioSnapshots)
    .values({
      periodo, plataforma: texto(data.plataforma, 'Sin identificar'),
      totalUsd: monto(data.totalUsd), totalArs: monto(data.totalArs),
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.periodo, portfolioSnapshots.plataforma],
      set: { totalUsd: monto(data.totalUsd), totalArs: monto(data.totalArs) },
    })
    .returning({ id: portfolioSnapshots.id });

  // Las posiciones se reemplazan enteras: un snapshot es una foto del momento,
  // no un acumulado, y mezclarlo con la foto anterior duplicaria tenencias.
  await db.delete(positions).where(eq(positions.snapshotId, snap.id));
  const tenencias = Array.isArray(data.positions) ? data.positions : [];
  if (tenencias.length) {
    await db.insert(positions).values(tenencias.map(p => ({
      snapshotId: snap.id,
      activo: texto(p?.activo, 'Sin identificar'),
      clase: texto(p?.clase, 'OTRO'),
      cantidad: String(num(p?.cantidad)),
      valorUsd: monto(p?.valorUsd), valorArs: monto(p?.valorArs),
    })));
  }
  return { id: snap.id, posiciones: tenencias.length };
}
