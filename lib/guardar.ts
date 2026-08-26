import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, consumos, salaries, portfolioSnapshots, positions, gastos, transacciones } from '@/db/schema';
import { CATEGORIAS } from './prompts';
import type { StatementData, SalaryData, PortfolioData, GastoData, MovimientoData } from './tipos';

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

// El modelo puede devolver una categoria que no esta en la lista: se acepta como
// "Otros" en vez de rechazar el gasto, y despues se corrige a mano.
const categoriaValida = (v: unknown): string => {
  const c = texto(v, 'Otros');
  return (CATEGORIAS as readonly string[]).includes(c) ? c : 'Otros';
};

/**
 * Movimientos de un export de broker. Devuelve cuantos entraron y cuantos ya
 * estaban: subir dos veces el mismo CSV no puede duplicar el historial, y es
 * exactamente lo que uno hace cuando no esta seguro de si ya lo subio.
 *
 * La identidad de una operacion es su contenido, porque el CSV rara vez trae un
 * id: mismo activo, misma fecha, misma cantidad y mismo precio es la misma
 * operacion. Dos compras identicas el mismo dia colapsan en una — es el precio
 * de no tener id, y preferible a duplicar todo el historial.
 */
export async function guardarMovimientos(movs: MovimientoData[], origen: string) {
  let nuevos = 0, repetidos = 0, descartados = 0;

  for (const m of movs) {
    const activo = texto(m?.activo, '').toUpperCase();
    const cantidad = num(m?.cantidad);
    const precio = num(m?.precioUnitario);
    const fecha = texto(m?.fecha, '');

    if (!activo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || cantidad <= 0) { descartados++; continue; }

    const huella = createHash('sha256')
      .update(`${origen}|${activo}|${m.tipo}|${fecha}|${cantidad}|${precio}`)
      .digest('hex').slice(0, 32);

    const [fila] = await db.insert(transacciones).values({
      activo,
      clase: texto(m?.clase, 'CRIPTO').toUpperCase(),
      tipo: m?.tipo === 'VENTA' ? 'VENTA' : 'COMPRA',
      fecha,
      cantidad: String(cantidad),
      precioUnitario: String(precio),
      moneda: m?.moneda === 'ARS' ? 'ARS' : 'USD',
      // El export no trae el dolar del dia. Sin el, una operacion en pesos no se
      // puede medir en dolares: se guarda igual y la UI pide completarlo.
      tipoCambioDia: null,
      comision: String(num(m?.comision)),
      origen,
      refExterna: `${origen}:${huella}`,
    })
      .onConflictDoNothing({ target: transacciones.refExterna })
      .returning({ id: transacciones.id });

    if (fila) nuevos++; else repetidos++;
  }
  return { nuevos, repetidos, descartados };
}

export type OrigenGasto = 'BOLETA' | 'FOTO' | 'TEXTO' | 'MANUAL';

export async function guardarGasto(
  data: GastoData, origen: OrigenGasto, fileId: string | null = null,
) {
  if (!periodoValido(data.periodo)) {
    throw new Error(`El periodo del gasto no tiene formato YYYY-MM (vino "${data.periodo}").`);
  }
  const monto = num(data.montoArs);
  if (monto <= 0 && num(data.montoUsd) <= 0) {
    throw new Error('No se pudo leer un importe mayor a cero en el comprobante.');
  }

  const [g] = await db.insert(gastos).values({
    fileId,
    periodo: data.periodo,
    fecha: typeof data.fecha === 'string' && data.fecha.trim() ? data.fecha.trim() : null,
    concepto: texto(data.concepto, 'Gasto sin descripcion'),
    categoria: categoriaValida(data.categoria),
    montoArs: String(monto),
    montoUsd: String(num(data.montoUsd)),
    origen,
    raw: data,
  }).returning({ id: gastos.id });

  return { id: g.id, periodo: data.periodo, monto };
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
