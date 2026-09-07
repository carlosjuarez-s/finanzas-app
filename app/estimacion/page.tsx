import Link from 'next/link';
import { proximoPeriodo } from '@/lib/estimacion';
import { estimacionDeMes } from '@/lib/estimar-mes';
import { periodosConDatos, conMesActual } from '@/lib/periodos';
import SelectorMes from '../selector-mes';
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
// El segundo color entro validado, no elegido a ojo: pasa las seis pruebas de
// scripts/validate_palette.js con los otros tres, en claro y en oscuro (peor
// par bajo daltonismo: 14,7 de separacion contra el verde).
const COLOR_FIJO = '#6B4E9E';

export default async function Estimacion({ searchParams }: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const usuarioId = await idUsuarioActual();
  const { periodo: qp } = await searchParams;
  const hoy = new Date().toISOString().slice(0, 7);

  let periodos: string[];
  let datos: Awaited<ReturnType<typeof estimacionDeMes>>;
  try {
    // Se puede estimar cualquier mes, no solo el que viene: mirar como se
    // habria estimado un mes que ya paso es la unica forma de saber si la
    // estimacion sirve.
    const conDatos = await periodosConDatos(usuarioId);
    const ultimo = conDatos[0];
    periodos = conMesActual(
      [...new Set([...conDatos, proximoPeriodo(ultimo, hoy)])].sort().reverse(),
      hoy,
    );
    datos = await estimacionDeMes(usuarioId, qp && periodos.includes(qp) ? qp : periodos[0]);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Estimación" />;
  }

  const e = datos.estimacion;
  const periodo = e.periodo;
  const tcReferencia = datos.tipoCambio;
  const ingresoRef = e.ingresoReferenciaArs;

  // El orden es por cuanto se le puede creer, de mas a menos: cuota firmada,
  // gasto fijo declarado, lo que aparenta repetirse, y lo que se adivina.
  const enElTotal = e.lineas.filter(l => l.enElTotal);
  const referencia = e.lineas.filter(l => !l.enElTotal);

  // Solo las dos que entran al total. La referencia se muestra aparte y no se
  // grafica junto a estas: pintarla igual la haria parecer parte del numero.
  const partes = [
    { etiqueta: 'Cuotas', valor: e.comprometidoArs, color: COLOR_COMPROMETIDO },
    { etiqueta: 'Fijos', valor: e.fijoArs, color: COLOR_FIJO },
  ];

  return (
    <main>
      <Nav />
      <p className="eyebrow">Estimación</p>
      <h1>{fmtPeriodo(periodo)}</h1>
      <SelectorMes periodos={periodos} actual={periodo} hoy={hoy} />

      {/* Lo primero que hay que saber es que esto no es un dato. */}
      <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
        Esto <strong>no</strong> es un mes cerrado: es una estimación y no entra al histórico.
        Cuando el mes pase y cargues los comprobantes, el número real lo reemplaza.
      </p>

      {e.periodoDelIngreso && (
        <p className="nota">
          El ingreso sale del sueldo de <strong>{fmtPeriodo(e.periodoDelIngreso)}</strong>, sin
          proyectar aumentos.{' '}
          <Link href={`/gastos?periodo=${e.periodoDelIngreso}`}>Ajustalo</Link> y esta pantalla
          cambia sola.
          {datos.tipoCambioDe && ` Se consolidó con el tipo de cambio del cierre de ${fmtPeriodo(datos.tipoCambioDe)}.`}
        </p>
      )}

      <div className="ledger">
        {/* Sin el "≈": no es una aproximacion, es la suma de cosas declaradas.
            Lo aproximado es la referencia, y va aparte. */}
        <div className="celda">
          <p className="eyebrow">Sale sí o sí</p>
          <p className="valor ars">{fmtArs(e.totalArs)}</p>
        </div>
        <div className="op">·</div>
        <div className="celda">
          <p className="eyebrow">De eso, cuotas</p>
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

      {/* Dos listas separadas, no una. En una sola tabla ordenada por monto,
          una mediana de dos meses queda arriba de una cuota firmada y las dos
          se leen igual. */}
      {enElTotal.length > 0 && (
        <section>
          <h2>Lo que sale sí o sí</h2>
          <BarChart
            datos={enElTotal.map(l => ({
              etiqueta: l.categoria,
              valor: l.montoArs,
              nota: l.base === 'comprometido' ? 'Cuota ya firmada' : 'Lo declaraste como fijo',
            }))}
            formato="ars"
          />
        </section>
      )}

      {referencia.length > 0 && (
        <section>
          <h2>
            Además, según tu historial
            <span className="chip">{fmtArs(e.referenciaArs)}</span>
          </h2>
          <p className="resultado">
            Esto <strong>no</strong> entra en el total de arriba: es lo único del cálculo que
            nadie declaró. Con esto sumado, el mes probablemente termine en{' '}
            <strong className="monto ars">{fmtArs(e.probableArs)}</strong>.
          </p>
          <BarChart
            datos={referencia.map(l => ({
              etiqueta: l.categoria,
              valor: l.montoArs,
              nota: `Mediana de ${l.mesesConDato} ${l.mesesConDato === 1 ? 'mes' : 'meses'} · ${l.base}`,
            }))}
            formato="ars"
          />
          <p className="nota">
            Sale de la <strong>mediana</strong> de los últimos {e.mesesUsados} meses, no del
            promedio: un mes con un gasto raro corre el promedio y no la mediana.
            {e.fijoArs > 0 && ' Y se le resta lo que ya declaraste como fijo, para no contarlo dos veces.'}{' '}
            Lo que veas repetirse acá, <Link href={`/gastos?periodo=${periodo}`}>declaralo como fijo</Link>{' '}
            y pasa al total.
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
