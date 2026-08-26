import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries, gastos } from '@/db/schema';
import { fmtArs, fmtPeriodo } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import GastoTexto from '../gasto-texto';
import BarChart from '../bar-chart';
import Editor, { type Item } from './editor';

export const dynamic = 'force-dynamic';

export default async function Gastos({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: qp } = await searchParams;

  let periodo: string | undefined;
  let sueltos: typeof gastos.$inferSelect[] = [];
  let sts: Awaited<ReturnType<typeof cargarStatements>> = [];
  let sueldo: typeof salaries.$inferSelect | undefined;

  async function cargarStatements(p: string) {
    return db.query.statements.findMany({ where: eq(statements.periodo, p), with: { consumos: true } });
  }

  try {
    const ultimoSt = await db.query.statements.findFirst({
      orderBy: desc(statements.periodo), columns: { periodo: true },
    });
    const ultimoGasto = await db.select({ periodo: gastos.periodo }).from(gastos)
      .orderBy(desc(gastos.periodo)).limit(1);

    // El mes mas reciente con algo cargado, sea tarjeta o gasto suelto.
    periodo = qp ?? [ultimoSt?.periodo, ultimoGasto[0]?.periodo].filter(Boolean).sort().pop();
    if (!periodo) {
      return (
        <main>
          <Nav />
          <p className="eyebrow">Gastos</p>
          <h1>Sin gastos cargados</h1>
          <p>Subí un comprobante desde el cierre, o anotá uno acá abajo.</p>
          <GastoTexto />
        </main>
      );
    }

    const [y, m] = periodo.split('-').map(Number);
    const anterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;

    [sts, sueltos, sueldo] = await Promise.all([
      cargarStatements(periodo),
      db.select().from(gastos).where(eq(gastos.periodo, periodo)),
      db.query.salaries.findFirst({
        where: inArray(salaries.periodo, [anterior, periodo]),
        orderBy: desc(salaries.periodo),
      }),
    ]);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Gastos" />;
  }

  const itemsGastos: Item[] = sueltos.map(g => ({
    id: g.id, entidad: 'gasto', descripcion: g.concepto, categoria: g.categoria,
    monto: Number(g.montoArs), origen: g.origen, corregido: g.corregido,
  }));

  const itemsConsumos: Item[] = sts.flatMap(st => st.consumos.map(c => ({
    id: c.id, entidad: 'consumo' as const, descripcion: c.comercio, categoria: c.categoria,
    monto: Number(c.montoArs), origen: st.card, corregido: c.corregido,
  }))).sort((a, b) => b.monto - a.monto);

  // Categorias del mes, juntando tarjeta y gastos sueltos: es la vista que
  // responde "en que se me va la plata", no de donde salio cada peso.
  const acum = new Map<string, number>();
  for (const i of [...itemsGastos, ...itemsConsumos]) {
    if (i.categoria) acum.set(i.categoria, (acum.get(i.categoria) ?? 0) + i.monto);
  }
  const porCategoria = [...acum.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([etiqueta, valor]) => ({ etiqueta, valor }));

  return (
    <main>
      <Nav />
      <p className="eyebrow">Gastos · {fmtPeriodo(periodo)}</p>
      <h1>Revisar y corregir</h1>
      <p className="resultado">
        Todo esto lo interpretó un modelo a partir de tus documentos. Si algo quedó mal,
        corregilo acá: el cierre del mes se recalcula solo.
      </p>

      {porCategoria.length > 1 && (
        <section>
          <h2>Gasto del mes por categoría</h2>
          <BarChart datos={porCategoria} formato="ars" />
        </section>
      )}

      <GastoTexto />

      <section>
        <h2>
          Servicios, alquiler y otros
          <span className="chip">{fmtArs(itemsGastos.reduce((s, i) => s + i.monto, 0))}</span>
        </h2>
        {itemsGastos.length
          ? itemsGastos.map(i => <Editor key={i.id} item={i} />)
          : <p className="resultado">Todavía no hay gastos fuera de la tarjeta en este mes.</p>}
      </section>

      {sueldo && (
        <section>
          <h2>Sueldo que paga este cierre</h2>
          <Editor
            item={{
              id: sueldo.id, entidad: 'sueldo',
              descripcion: `Neto de ${fmtPeriodo(sueldo.periodo)}`,
              categoria: null, monto: Number(sueldo.netoArs), corregido: sueldo.corregido,
            }}
          />
        </section>
      )}

      {itemsConsumos.length > 0 && (
        <section>
          <h2>Consumos de tarjeta</h2>
          <p className="resultado">
            Corregir una línea reacomoda el desglose por categoría. El total del mes sigue
            saliendo del «TOTAL A PAGAR» del resumen, que es el número que efectivamente pagás.
          </p>
          {itemsConsumos.map(i => <Editor key={i.id} item={i} />)}
        </section>
      )}
    </main>
  );
}
