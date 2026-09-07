import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { monthlyCloses, salaries } from '@/db/schema';
import { calcularCierre, cargarPrestamos } from '@/lib/cierre';
import { consolidar } from '@/lib/bimoneda';
import { listar as listarFijos, leerIndices, totalDelMes as totalDeFijos } from '@/lib/recurrentes';
import { estimar, proximoPeriodo, type MesHistorico } from '@/lib/estimacion';
import { fmtArs, fmtPeriodo } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import { idUsuarioActual } from '@/lib/usuario';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import StackedBar from '../stacked-bar';
import BarChart from '../bar-chart';
import Monto from '../monto';

export const dynamic = 'force-dynamic';

// La misma paleta validada del cierre. Acá el orden codifica confianza:
// comprometido primero, variable último.
const COLOR_COMPROMETIDO = '#B4690E';
// El cuarto color entro validado, no elegido a ojo: pasa las seis pruebas de
// scripts/validate_palette.js con los otros tres, en claro y en oscuro (peor
// par bajo daltonismo: 14,7 de separacion contra el verde).
const COLOR_FIJO = '#6B4E9E';
const COLOR_RECURRENTE = '#2D5FA8';
const COLOR_VARIABLE = '#1E7A4F';

export default async function Estimacion() {
  const usuarioId = await idUsuarioActual();
  const hoy = new Date().toISOString().slice(0, 7);

  let cierres, prestamos, ultimoSueldo;
  try {
    [cierres, prestamos, ultimoSueldo] = await Promise.all([
      db.select().from(monthlyCloses).where(eq(monthlyCloses.usuarioId, usuarioId))
        .orderBy(asc(monthlyCloses.periodo)),
      cargarPrestamos(usuarioId),
      db.query.salaries.findFirst({
        where: eq(salaries.usuarioId, usuarioId), orderBy: desc(salaries.periodo),
      }),
    ]);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Estimación" />;
  }

  const periodo = proximoPeriodo(cierres[cierres.length - 1]?.periodo, hoy);

  // El tipo de cambio del mes que viene no existe: se usa el del cierre más
  // reciente que tenga uno. Es un supuesto, y por eso se dice cuál se usó.
  const tcReferencia = [...cierres].reverse()
    .map(c => (c.tipoCambio === null ? null : Number(c.tipoCambio)))
    .find(tc => tc !== null && tc > 0) ?? null;

  const historico: MesHistorico[] = cierres.map(c => ({
    periodo: c.periodo,
    porCategoria: c.porCategoria as Record<string, number>,
    gastoTotalArs: consolidar(
      { ars: Number(c.gastoArs), usd: Number(c.gastoUsd) },
      c.tipoCambio === null ? null : Number(c.tipoCambio),
    ).totalArs,
  }));

  // El último sueldo conocido, sin proyectar aumentos: inventar una paritaria
  // sería agregarle un error propio a una estimación que ya tiene el suyo.
  const ingresoRef = ultimoSueldo
    ? consolidar(
        { ars: Number(ultimoSueldo.netoArs), usd: Number(ultimoSueldo.netoUsd) },
        tcReferencia,
      ).totalArs
    : null;

  // Lo declarado le gana a lo inferido: los fijos entran con su monto y su
  // aumento, y se restan del historico para no contarse dos veces.
  const [fijos, indices] = await Promise.all([listarFijos(usuarioId), leerIndices(usuarioId)]);
  const delMes = totalDeFijos(fijos, periodo, indices);
  const fijosArs = consolidar(delMes.monto, tcReferencia).totalArs;

  const e = estimar(periodo, historico, prestamos, ingresoRef, {
    tipoCambio: tcReferencia,
    fijos: {
      porCategoria: delMes.porCategoria,
      totalArs: fijosArs ?? delMes.monto.ars,
      faltaIndice: delMes.faltaIndice,
    },
  });

  // El orden es por cuanto se le puede creer, de mas a menos: cuota firmada,
  // gasto fijo declarado, lo que aparenta repetirse, y lo que se adivina.
  const partes = [
    { etiqueta: 'Comprometido', valor: e.comprometidoArs, color: COLOR_COMPROMETIDO },
    { etiqueta: 'Fijo', valor: e.fijoArs, color: COLOR_FIJO },
    { etiqueta: 'Recurrente', valor: e.recurrenteArs, color: COLOR_RECURRENTE },
    { etiqueta: 'Variable', valor: e.variableArs, color: COLOR_VARIABLE },
  ];

  return (
    <main>
      <Nav />
      <p className="eyebrow">Estimación</p>
      <h1>{fmtPeriodo(periodo)}</h1>

      {/* Lo primero que hay que saber es que esto no es un dato. */}
      <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
        Esto <strong>no</strong> es un mes cerrado: es una estimación y no entra al histórico.
        Cuando el mes pase y cargues los comprobantes, el número real lo reemplaza.
      </p>

      <div className="ledger">
        <div className="celda">
          <p className="eyebrow">Vas a gastar</p>
          <p className="valor ars">≈ {fmtArs(e.totalArs)}</p>
        </div>
        <div className="op">·</div>
        <div className="celda">
          <p className="eyebrow">Ya comprometido</p>
          <p className="valor ars">{fmtArs(e.comprometidoArs)}</p>
        </div>
        <div className="op">·</div>
        <div className="celda">
          <p className="eyebrow">Te quedaría</p>
          <p className="valor">
            {e.ahorroEstimadoArs !== null && <span aria-hidden="true">≈ </span>}
            <Monto valor={e.ahorroEstimadoArs} />
          </p>
        </div>
      </div>

      {e.advertencias.map((a, i) => (
        <p className="nota" key={i}>{a}</p>
      ))}

      {e.totalArs > 0 && (
        <section>
          <h2>Cuánto de esto se puede afirmar</h2>
          <StackedBar partes={partes} formato="ars" />
          <p className="nota">
            <strong>Comprometido</strong> son cuotas que ya están firmadas: eso se paga sí o sí.
            <strong> Recurrente</strong> es lo que aparece todos los meses.
            <strong> Variable</strong> es lo que peor se predice — cuanto más pese, menos le creas
            al total.
          </p>
        </section>
      )}

      {e.lineas.length > 0 && (
        <section>
          <h2>Por categoría</h2>
          <BarChart
            datos={e.lineas.map(l => ({
              etiqueta: l.categoria,
              valor: l.montoArs,
              // La nota dice de donde sale el numero, que es lo que decide
              // cuanto creerle: una cuota firmada y una mediana de dos meses
              // no valen lo mismo.
              nota: l.base === 'comprometido' ? 'Cuotas ya firmadas'
                : l.base === 'fijo' ? 'Lo declaraste como fijo'
                : `Mediana de ${l.mesesConDato} ${l.mesesConDato === 1 ? 'mes' : 'meses'} · ${l.base}`,
            }))}
            formato="ars"
          />
          <p className="nota">
            Lo que declaraste como fijo entra con su monto y su aumento. El resto sale de la{' '}
            <strong>mediana</strong> de los últimos {e.mesesUsados} meses, no del promedio: un mes
            con un gasto raro corre el promedio y no la mediana.
            {e.fijoArs > 0 && ' Los fijos se restan del histórico para no contarse dos veces.'}
          </p>
        </section>
      )}

      {ingresoRef !== null && (
        <p className="nota">
          El ingreso de referencia es el último sueldo cargado ({fmtArs(ingresoRef)}), sin
          proyectar aumentos. Inventar una paritaria sería agregarle un error propio a una
          estimación que ya tiene el suyo.
        </p>
      )}
    </main>
  );
}
