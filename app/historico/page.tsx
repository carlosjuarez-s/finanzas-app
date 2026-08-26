import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { monthlyCloses } from '@/db/schema';
import { fmtArs, fmtPct, fmtPeriodo } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import LineChart from '../line-chart';
import BarChart from '../bar-chart';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';

export const dynamic = 'force-dynamic';

export default async function Historico() {
  let cierres;
  try {
    cierres = await db.select().from(monthlyCloses).orderBy(asc(monthlyCloses.periodo));
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;   // otro error de base: que se vea, no que se disfrace
    return <FaltaMigracion tabla={tabla} seccion="Historico" />;
  }

  if (!cierres.length) {
    return (
      <main>
        <Nav />
        <p className="eyebrow">Historico</p>
        <h1>Sin meses cerrados</h1>
        <p>Cargá al menos un resumen desde el cierre para empezar a ver la evolución.</p>
      </main>
    );
  }

  const etiquetas = cierres.map(c => fmtPeriodo(c.periodo));
  const ingresos = cierres.map(c => Number(c.ingresoArs));
  const gastos = cierres.map(c => Number(c.gastoArs));
  const ahorros = cierres.map(c => Number(c.ahorroArs));

  const totalAhorrado = ahorros.reduce((s, v) => s + v, 0);
  const conIngreso = cierres.filter(c => c.tasaAhorro !== null);
  const tasaPromedio = conIngreso.length
    ? conIngreso.reduce((s, c) => s + Number(c.tasaAhorro), 0) / conIngreso.length
    : null;

  // Categorias sumadas sobre todos los meses, para ver en que se va la plata
  // mas alla del mes puntual.
  const acumCategorias = new Map<string, number>();
  for (const c of cierres) {
    for (const [cat, monto] of Object.entries(c.porCategoria as Record<string, number>)) {
      acumCategorias.set(cat, (acumCategorias.get(cat) ?? 0) + monto);
    }
  }
  const cats = [...acumCategorias.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <main>
      <Nav />
      <p className="eyebrow">Historico</p>
      <h1>{cierres.length} {cierres.length === 1 ? 'mes cerrado' : 'meses cerrados'}</h1>

      <div className="ledger">
        <div className="celda">
          <p className="eyebrow">Ahorro acumulado</p>
          <p className="valor" style={{ color: totalAhorrado >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>
            {fmtArs(totalAhorrado)}
          </p>
        </div>
        <div className="op">·</div>
        <div className="celda">
          <p className="eyebrow">Tasa promedio</p>
          <p className="valor ars">{tasaPromedio === null ? '—' : fmtPct(tasaPromedio)}</p>
        </div>
        <div className="op">·</div>
        <div className="celda">
          <p className="eyebrow">Meses con recibo</p>
          <p className="valor">{conIngreso.length} / {cierres.length}</p>
        </div>
      </div>

      <section>
        <h2>Ingreso, gasto y ahorro</h2>
        <LineChart
          etiquetas={etiquetas}
          series={[
            { nombre: 'Gasto', valores: gastos },
            { nombre: 'Ingreso', valores: ingresos },
            { nombre: 'Ahorro', valores: ahorros },
          ]}
          formato="corto"
          unidad="ARS"
        />
        <p className="nota">
          Montos nominales en pesos: entre meses lejanos la inflación los hace difíciles
          de comparar. La proyección trabaja en dólares reales justamente por eso.
        </p>
      </section>

      <section>
        <h2>En qué se fue la plata (todos los meses)</h2>
        <BarChart
          datos={cats.map(([cat, monto]) => ({ etiqueta: cat, valor: monto }))}
          formato="ars"
        />
      </section>

      <section>
        <h2>Tasa de ahorro mes a mes</h2>
        <BarChart
          datos={cierres.filter(c => c.tasaAhorro !== null).map(c => ({
            etiqueta: fmtPeriodo(c.periodo), valor: Number(c.tasaAhorro),
          }))}
          formato="pct"
          divergente
        />
        <p className="nota">
          Una tasa negativa es un mes en que gastaste más de lo que entró. Puede ser real,
          o puede ser que falte cargar el recibo de ese mes.
        </p>
      </section>

      <section>
        <h2>Mes a mes</h2>
        {[...cierres].reverse().map(c => (
          <div className="fila" key={c.periodo}>
            <span className="monto">{fmtPeriodo(c.periodo)}</span>
            <span>
              <span className="monto ars">{fmtArs(Number(c.ahorroArs))}</span>
              {c.tasaAhorro !== null && <span className="chip">{fmtPct(Number(c.tasaAhorro))}</span>}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
