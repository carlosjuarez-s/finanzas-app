import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { goals, monthlyCloses } from '@/db/schema';
import { leerSupuestos, ahorroAcumuladoUsd } from '@/lib/supuestos';
import { proyectar, promedioMensual, mesQueAlcanza } from '@/lib/proyeccion';
import { fmtUsd, fmtPct, fmtPeriodo } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import MetaForm from './meta-form';
import BorrarMeta from './borrar-meta';
import { idUsuarioActual } from '@/lib/usuario';

export const dynamic = 'force-dynamic';

const HORIZONTE_MESES = 360; // 30 años: mas alla, la estimacion no dice nada

export default async function Metas() {
  const usuarioId = await idUsuarioActual();
  let metas, supuestos, cierres, acumuladoUsd;
  try {
    [metas, supuestos, cierres] = await Promise.all([
      db.select().from(goals).where(eq(goals.usuarioId, usuarioId)).orderBy(asc(goals.createdAt)),
      leerSupuestos(usuarioId),
      db.select().from(monthlyCloses).where(eq(monthlyCloses.usuarioId, usuarioId))
        .orderBy(asc(monthlyCloses.periodo)),
    ]);
    acumuladoUsd = await ahorroAcumuladoUsd(usuarioId, supuestos.tipoCambioArs);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Metas" />;
  }
  const prom = promedioMensual(cierres.map(c => ({
    ingresoArs: Number(c.ingresoArs), gastoArs: Number(c.gastoArs),
  })));
  const aporteMensualUsd = supuestos.tipoCambioArs > 0
    ? Math.max(0, (prom.ingresoArs - prom.gastoArs) / supuestos.tipoCambioArs)
    : 0;

  // Una sola proyeccion sirve para todas las metas: cambia el umbral, no la curva.
  const puntos = proyectar({
    aporteMensualUsd, meses: HORIZONTE_MESES, supuestos, saldoInicialUsd: acumuladoUsd,
  });

  return (
    <main>
      <Nav />
      <p className="eyebrow">Metas</p>
      <h1>{metas.length ? `${metas.length} ${metas.length === 1 ? 'meta' : 'metas'}` : 'Sin metas todavia'}</h1>

      <section>
        <h2>Nueva meta</h2>
        <MetaForm />
      </section>

      {metas.length > 0 && (
        <section>
          <h2>Progreso</h2>
          {aporteMensualUsd === 0 && (
            <p className="nota">
              Todavía no hay ahorro mensual promedio (faltan cierres con recibo, o los gastos
              igualan al ingreso). Las estimaciones de fecha aparecen cuando haya al menos un
              mes con ahorro positivo.
            </p>
          )}

          {metas.map(m => {
            const objetivoUsd = m.moneda === 'USD'
              ? Number(m.montoObjetivo)
              : Number(m.montoObjetivo) / (supuestos.tipoCambioArs || 1);
            const avance = objetivoUsd > 0 ? Math.min(100, (acumuladoUsd / objetivoUsd) * 100) : 0;
            const alcanza = aporteMensualUsd > 0 ? mesQueAlcanza(puntos, objetivoUsd, 'INDICE') : null;
            const alcanzaDolares = aporteMensualUsd > 0 ? mesQueAlcanza(puntos, objetivoUsd, 'DOLARES') : null;

            return (
              <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px dotted var(--linea)' }}>
                <div className="fila" style={{ border: 'none', padding: 0 }}>
                  <span>
                    <strong>{m.nombre}</strong>
                    <span className="chip">{m.moneda}</span>
                    {m.fechaObjetivo && <span className="chip">para {fmtPeriodo(m.fechaObjetivo)}</span>}
                  </span>
                  <span className="monto usd">{fmtUsd(objetivoUsd)}</span>
                </div>

                <div className="barra" style={{ width: `${avance}%` }} />

                <div className="fila" style={{ border: 'none', paddingTop: 6 }}>
                  <span className="resultado">
                    {fmtUsd(acumuladoUsd)} acumulado · {fmtPct(avance)}
                  </span>
                  <BorrarMeta id={m.id} nombre={m.nombre} />
                </div>

                {avance >= 100 ? (
                  <p className="resultado usd">Ya alcanzada con el ahorro acumulado.</p>
                ) : aporteMensualUsd > 0 && (
                  <p className="resultado">
                    {alcanzaDolares
                      ? `En dolares quietos: ${fmtPeriodo(alcanzaDolares.periodo)}.`
                      : 'En dolares quietos: no se alcanza en 30 años.'}
                    {' '}
                    {alcanza
                      ? `Invirtiendo en el indice: ${fmtPeriodo(alcanza.periodo)}.`
                      : 'Invirtiendo en el indice: tampoco se alcanza en 30 años.'}
                  </p>
                )}
              </div>
            );
          })}

          <p className="nota">
            El progreso usa el ahorro acumulado de todos los meses cerrados, convertido a
            dólares al tipo de cambio actual de los supuestos. Es un orden de magnitud: cada
            mes se habría comprado a la cotización de ese mes, no a la de hoy. Las fechas
            salen de proyectar tu ahorro promedio ({prom.meses} {prom.meses === 1 ? 'mes' : 'meses'})
            con los supuestos que definiste, no de una predicción de mercado.
          </p>
        </section>
      )}
    </main>
  );
}
