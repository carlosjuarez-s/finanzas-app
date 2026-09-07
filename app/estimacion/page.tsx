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
// El cuarto color entro validado, no elegido a ojo: pasa las seis pruebas de
// scripts/validate_palette.js con los otros tres, en claro y en oscuro (peor
// par bajo daltonismo: 14,7 de separacion contra el verde).
const COLOR_FIJO = '#6B4E9E';
const COLOR_RECURRENTE = '#2D5FA8';
const COLOR_VARIABLE = '#1E7A4F';

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
