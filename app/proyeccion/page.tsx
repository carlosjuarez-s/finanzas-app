import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { monthlyCloses } from '@/db/schema';
import { leerSupuestos, ahorroAcumuladoUsd } from '@/lib/supuestos';
import { promedioMensual } from '@/lib/proyeccion';
import { fmtArs } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import Simulador from './simulador';

export const dynamic = 'force-dynamic';

export default async function Proyeccion() {
  let supuestos, cierres, acumuladoUsd;
  try {
    [supuestos, cierres] = await Promise.all([
      leerSupuestos(),
      db.select().from(monthlyCloses).orderBy(asc(monthlyCloses.periodo)),
    ]);
    acumuladoUsd = await ahorroAcumuladoUsd(supuestos.tipoCambioArs);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Proyeccion" />;
  }

  // Ultimos 6 meses: suficiente para suavizar un mes raro sin arrastrar un
  // sueldo de hace dos años.
  const prom = promedioMensual(
    cierres.map(c => ({ ingresoArs: Number(c.ingresoArs), gastoArs: Number(c.gastoArs) })),
  );

  if (!prom.meses) {
    return (
      <main>
        <Nav />
        <p className="eyebrow">Proyeccion</p>
        <h1>Faltan datos</h1>
        <p>
          La proyección parte de tu ingreso y gasto reales. Cargá al menos un mes con
          resumen y recibo desde el cierre y volvé.
        </p>
      </main>
    );
  }

  return (
    <main>
      <Nav />
      <p className="eyebrow">Proyeccion</p>
      <h1>Simulador</h1>
      <p className="resultado">
        Promedio de {prom.meses} {prom.meses === 1 ? 'mes' : 'meses'}: ingreso {fmtArs(prom.ingresoArs)},
        gasto {fmtArs(prom.gastoArs)}.
      </p>

      <Simulador
        supuestos={supuestos}
        ingresoMensualArs={prom.ingresoArs}
        gastoMensualArs={prom.gastoArs}
        mesesDeDatos={prom.meses}
        ahorroAcumuladoUsd={acumuladoUsd}
      />
    </main>
  );
}
