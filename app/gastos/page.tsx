import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries, gastos, prestamosPersonales } from '@/db/schema';
import { cargarPrestamos, tipoCambioDelMes } from '@/lib/cierre';
import { estadoDePagos, type EstadoDePagos } from '@/lib/pagos';
import { consolidar } from '@/lib/bimoneda';
import { totalDelMes, type Prestamo } from '@/lib/prestamos';
import type { PrestamoPersonal } from '@/lib/fiado';
import { fmtArs, fmtCorto, fmtPeriodo } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import GastoTexto from '../gasto-texto';
import BarChart from '../bar-chart';
import Prestamos from './prestamos';
import Fiado from './fiado';
import Pendientes from './pendientes';
import Categorias from './categorias';
import SueldoManual from './sueldo';
import Ingresos, { type Fila as FilaIngreso } from './ingresos';
import { listar as listarIngresos } from '@/lib/ingresos';
import Editor, { type Item } from './editor';
import { leerCategorias } from '@/lib/categorias';
import { periodosConDatos } from '@/lib/periodos';
import SelectorMes from '../selector-mes';
import FiltroCategoria from './filtro-categoria';
import Secciones, { type Seccion } from '../secciones';
import { idUsuarioActual } from '@/lib/usuario';

export const dynamic = 'force-dynamic';

// Lo que vale un item en pesos, para ordenar. Sin tipo de cambio se ordena por
// la parte en pesos: es lo unico que se sabe, y ordenar mal es mejor que
// inventar una cotizacion.
const enPesosItem = (i: Item, tc: number | null) =>
  consolidar({ ars: i.monto, usd: i.montoUsd ?? 0 }, tc).totalArs ?? i.monto;

export default async function Gastos({ searchParams }: {
  searchParams: Promise<{ periodo?: string; categoria?: string }>;
}) {
  const usuarioId = await idUsuarioActual();
  const { periodo: qp, categoria: filtro } = await searchParams;
  // La fecha la fija el servidor: si la calculara el cliente, dos telefonos en
  // zonas distintas mostrarian "hace 7 meses" y "hace 8" para el mismo prestamo.
  const hoyISO = new Date().toISOString().slice(0, 10);
  const categorias = await leerCategorias(usuarioId);

  let periodo: string | undefined;
  let sueltos: typeof gastos.$inferSelect[] = [];
  let sts: Awaited<ReturnType<typeof cargarStatements>> = [];
  let sueldo: typeof salaries.$inferSelect | undefined;
  let prestamos: Prestamo[] = [];
  let fiados: PrestamoPersonal[] = [];
  let pagos: EstadoDePagos = { pendientes: [], pagados: 0, faltaPagarArs: 0 };
  let tc: number | null = null;
  let anterior = '';
  let periodos: string[] = [];
  let entradas: FilaIngreso[] = [];

  async function cargarStatements(p: string) {
    return db.query.statements.findMany({
      where: and(eq(statements.usuarioId, usuarioId), eq(statements.periodo, p)),
      with: { consumos: true },
    });
  }

  // Los prestamos a personas no dependen del mes: lo que te deben te lo deben
  // hoy, sin importar que cierre estes mirando.
  async function cargarFiados(): Promise<PrestamoPersonal[]> {
    const filas = await db.query.prestamosPersonales.findMany({
      where: eq(prestamosPersonales.usuarioId, usuarioId), with: { devoluciones: true },
    });
    return filas.map(f => ({
      id: f.id, persona: f.persona, concepto: f.concepto,
      monto: Number(f.monto), moneda: f.moneda, fecha: f.fecha,
      perdonado: f.perdonado,
      devoluciones: f.devoluciones.map(d => ({ id: d.id, fecha: d.fecha, monto: Number(d.monto) })),
    }));
  }

  try {
    const ultimoSt = await db.query.statements.findFirst({
      where: eq(statements.usuarioId, usuarioId),
      orderBy: desc(statements.periodo), columns: { periodo: true },
    });
    const ultimoGasto = await db.select({ periodo: gastos.periodo }).from(gastos)
      .where(eq(gastos.usuarioId, usuarioId))
      .orderBy(desc(gastos.periodo)).limit(1);

    // El mes mas reciente con algo cargado, sea tarjeta o gasto suelto.
    periodo = qp ?? [ultimoSt?.periodo, ultimoGasto[0]?.periodo].filter(Boolean).sort().pop();
    periodos = await periodosConDatos(usuarioId);
    if (!periodo) {
      // Sin gastos todavia se puede estar pagando un credito, y hay que poder
      // cargarlo: si no, la unica forma de llegar a esta seccion seria subir
      // primero un comprobante que no tiene nada que ver.
      const mesActual = new Date().toISOString().slice(0, 7);
      const [ya, ma] = mesActual.split('-').map(Number);
      const mesPrevio = `${ma === 1 ? ya - 1 : ya}-${String(ma === 1 ? 12 : ma - 1).padStart(2, '0')}`;
      const sueldoInicial = await db.query.salaries.findFirst({
        where: and(eq(salaries.usuarioId, usuarioId), inArray(salaries.periodo, [mesPrevio, mesActual])),
        orderBy: desc(salaries.periodo),
      });
      return (
        <main>
          <Nav />
          <p className="eyebrow">Gastos</p>
          <h1>Sin gastos cargados</h1>
          <p>Subí un comprobante desde el cierre, o anotá uno acá abajo.</p>
          {/* El sueldo va primero aunque no haya un solo gasto: sin ingreso no
              hay tasa de ahorro, y es lo primero que alguien quiere ver. */}
          <SueldoManual
            periodo={mesActual}
            anterior={mesPrevio}
            tipoCambio={await tipoCambioDelMes(usuarioId, mesActual, null)}
            actual={sueldoInicial ? {
              periodo: sueldoInicial.periodo,
              netoArs: Number(sueldoInicial.netoArs),
              netoUsd: Number(sueldoInicial.netoUsd),
              corregido: sueldoInicial.corregido,
            } : null}
          />
          <GastoTexto />
          <Prestamos prestamos={await cargarPrestamos(usuarioId)} periodo={mesActual} />
          <Fiado prestamos={await cargarFiados()} hoy={hoyISO} />
        </main>
      );
    }

    const [y, m] = periodo.split('-').map(Number);
    anterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;

    [sts, sueltos, sueldo, prestamos, fiados, entradas] = await Promise.all([
      cargarStatements(periodo),
      db.select().from(gastos).where(and(eq(gastos.usuarioId, usuarioId), eq(gastos.periodo, periodo))),
      db.query.salaries.findFirst({
        where: and(eq(salaries.usuarioId, usuarioId), inArray(salaries.periodo, [anterior, periodo])),
        orderBy: desc(salaries.periodo),
      }),
      cargarPrestamos(usuarioId),
      cargarFiados(),
      listarIngresos(usuarioId, periodo),
    ]);

    // Lo pendiente se mira en pesos: para eso hace falta el tipo de cambio del
    // mes, el mismo que usa el cierre. El sueldo bimonetario usa el mismo.
    tc = await tipoCambioDelMes(usuarioId, periodo, null);
    pagos = await estadoDePagos(usuarioId, periodo, tc);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Gastos" />;
  }

  const itemsGastos: Item[] = sueltos.map(g => ({
    id: g.id, entidad: 'gasto', descripcion: g.concepto, categoria: g.categoria,
    monto: Number(g.montoArs), montoUsd: Number(g.montoUsd),
    origen: g.origen, corregido: g.corregido,
  }));

  const itemsConsumos: Item[] = sts.flatMap(st => st.consumos.map(c => ({
    id: c.id, entidad: 'consumo' as const, descripcion: c.comercio, categoria: c.categoria,
    monto: Number(c.montoArs), montoUsd: Number(c.montoUsd),
    origen: st.card, corregido: c.corregido,
  }))).sort((a, b) => enPesosItem(b, tc) - enPesosItem(a, tc));

  // Categorias del mes, juntando tarjeta y gastos sueltos: es la vista que
  // responde "en que se me va la plata", no de donde salio cada peso.
  const acum = new Map<string, number>();
  // Un consumo en dolares vale lo que vale al cambio del mes. Sumando solo
  // `montoArs`, una compra de USD 200 entraba al grafico como cero mientras el
  // cierre la contaba: dos pantallas del mismo mes decian cosas distintas.
  let sinConvertir = 0;
  for (const i of [...itemsGastos, ...itemsConsumos]) {
    if (!i.categoria) continue;
    const total = consolidar({ ars: i.monto, usd: i.montoUsd ?? 0 }, tc).totalArs;
    if (total === null) { sinConvertir++; continue; }
    acum.set(i.categoria, (acum.get(i.categoria) ?? 0) + total);
  }
  // La cuota no es un item cargado, sale del plan del prestamo: si no entra
  // acá, el grafico muestra menos gasto del que el cierre esta contando.
  const cuotas = consolidar(totalDelMes(prestamos, periodo), tc).totalArs;
  if (cuotas) acum.set('Cuotas', (acum.get('Cuotas') ?? 0) + cuotas);
  const porCategoria = [...acum.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([etiqueta, valor]) => ({ etiqueta, valor }));

  // Llegar desde el cierre tocando una categoria: se muestra solo esa. El
  // grafico y los totales del mes NO se filtran —son del mes, no del filtro—
  // porque si tambien cambiaran, uno perderia la referencia contra la que
  // estaba comparando.
  const coincide = (i: Item) => !filtro || i.categoria === filtro;
  const visiblesGastos = itemsGastos.filter(coincide);
  const visiblesConsumos = itemsConsumos.filter(coincide);

  // Cuatro pestañas en vez de diez secciones apiladas. El agrupamiento es por
  // pregunta, no por tabla: "en que se me fue", "que entro", "que debo",
  // "como esta configurado".
  const SECCIONES: Seccion[] = [
    {
      clave: 'gastos',
      titulo: 'Se fue',
      // Corto y no el monto entero: "$ 2.647.677,00" en la pestaña se comia la
      // tira en un telefono y empujaba las otras tres fuera de pantalla.
      chip: '$ ' + fmtCorto(visiblesGastos.reduce((s, i) => s + i.monto, 0) + visiblesConsumos.reduce((s, i) => s + i.monto, 0)),
      contenido: (
        <>
          {porCategoria.length > 1 && (
            <section>
              <h2>Gasto del mes por categoría</h2>
              <BarChart datos={porCategoria} formato="ars" />
              {sinConvertir > 0 && (
                <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
                  {sinConvertir === 1 ? 'Un gasto en dólares no está' : `${sinConvertir} gastos en dólares no están`} en
                  este gráfico: falta el tipo de cambio del mes y no se pueden pasar a pesos.
                  Cargalo en Supuestos.
                </p>
              )}
            </section>
          )}

          <GastoTexto />

          <section>
            <h2>
              Servicios, alquiler y otros
              <span className="chip">{fmtArs(visiblesGastos.reduce((s, i) => s + i.monto, 0))}</span>
            </h2>
            {visiblesGastos.length
              ? visiblesGastos.map(i => <Editor key={i.id} item={i} categorias={categorias} />)
              : <p className="resultado">
                  {filtro
                    ? `Ningún gasto suelto de este mes es de «${filtro}».`
                    : 'Todavía no hay gastos fuera de la tarjeta en este mes.'}
                </p>}
          </section>

          {visiblesConsumos.length > 0 && (
            <section>
              <h2>Consumos de tarjeta</h2>
              <p className="resultado">
                Corregir una línea reacomoda el desglose por categoría. El total del mes sigue
                saliendo del «TOTAL A PAGAR» del resumen, que es el número que efectivamente pagás.
              </p>
              {visiblesConsumos.map(i => <Editor key={i.id} item={i} categorias={categorias} />)}
            </section>
          )}
        </>
      ),
    },
    {
      clave: 'entra',
      titulo: 'Entró',
      contenido: (
        <>
          <SueldoManual
            periodo={periodo}
            anterior={anterior}
            tipoCambio={tc}
            actual={sueldo ? {
              periodo: sueldo.periodo,
              netoArs: Number(sueldo.netoArs),
              netoUsd: Number(sueldo.netoUsd),
              corregido: sueldo.corregido,
            } : null}
          />
          <Ingresos periodo={periodo} filas={entradas} />
        </>
      ),
    },
    {
      clave: 'debo',
      titulo: 'Debo',
      chip: pagos.pendientes.length ? String(pagos.pendientes.length) : undefined,
      chipCorto: true,
      contenido: (
        <>
          <Pendientes {...pagos} />
          <Prestamos prestamos={prestamos} periodo={periodo} />
          <Fiado prestamos={fiados} hoy={hoyISO} />
        </>
      ),
    },
    {
      clave: 'ajustes',
      titulo: 'Ajustes',
      contenido: <Categorias categorias={categorias} />,
    },
  ];

  return (
    <main>
      <Nav />
      <p className="eyebrow">Gastos · {fmtPeriodo(periodo)}</p>
      <h1>Revisar y corregir</h1>
      {periodos.length > 1 && (
        <SelectorMes periodos={periodos} actual={periodo} conservar={{ categoria: filtro }} />
      )}
      <p className="resultado">
        Todo esto lo interpretó un modelo a partir de tus documentos. Si algo quedó mal,
        corregilo acá: el cierre del mes se recalcula solo.
      </p>

      {filtro && (
        <FiltroCategoria
          categoria={filtro}
          periodo={periodo}
          cuantos={visiblesGastos.length + visiblesConsumos.length}
          esCuotas={filtro === 'Cuotas' && (cuotas ?? 0) > 0}
        />
      )}

      {/* Llegando con un filtro, la pestaña util es la de los gastos: abrir en
          otra obligaria a buscar lo que uno vino a ver. */}
      <Secciones secciones={SECCIONES} inicial={filtro ? 'gastos' : undefined} />
    </main>
  );
}
