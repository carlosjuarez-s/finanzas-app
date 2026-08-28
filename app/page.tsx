import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, portfolioSnapshots, gastos as tablaGastos } from '@/db/schema';
import { calcularCierre, cargarPrestamos } from '@/lib/cierre';
import { totalDelMes } from '@/lib/prestamos';
import { preciosDePortafolio } from '@/lib/precios';
import { clasesDeActivos, ratiosVigentes } from '@/lib/sync-portafolio';
import { fmtArs, fmtUsd } from '@/lib/formato';
import { ALICUOTA_PERCEPCION, pesoSobreGasto } from '@/lib/impuestos';
import Nav from './nav';
import SyncButton from './sync-button';
import UploadPanel from './upload-panel';
import BarChart from './bar-chart';
import StackedBar from './stacked-bar';
import { idUsuarioActual } from '@/lib/usuario';

// Paleta validada para tres categorias sobre el papel de la app (contraste,
// separacion bajo daltonismo y piso de croma). No agregar un cuarto color sin
// volver a validarla: un hue inventado se confunde con alguno de estos.
const COLOR_TARJETA = '#B4690E';
const COLOR_OTROS = '#2D5FA8';
const COLOR_AHORRO = '#1E7A4F';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const usuarioId = await idUsuarioActual();
  const { periodo: qp } = await searchParams;
  const ultimo = await db.query.statements.findFirst({
    where: eq(statements.usuarioId, usuarioId),
    orderBy: desc(statements.periodo), columns: { periodo: true },
  });
  const periodo = qp ?? ultimo?.periodo;
  if (!periodo) {
    return (
      <main>
        <Nav />
        <p className="eyebrow">Cierre financiero</p>
        <h1>Sin datos</h1>
        <p>Sincroniza Drive o subi los documentos a mano para armar el primer cierre.</p>
        <SyncButton />
        <UploadPanel />
      </main>
    );
  }

  const sts = await db.query.statements.findMany({
    where: and(eq(statements.usuarioId, usuarioId), eq(statements.periodo, periodo)),
    with: { consumos: true },
  });
  const snapshots = await db.query.portfolioSnapshots.findMany({
    where: and(eq(portfolioSnapshots.usuarioId, usuarioId), eq(portfolioSnapshots.periodo, periodo)),
    with: { positions: true },
  });

  // Mismo calculo que persiste el historico: si divergieran, el dashboard y los
  // graficos mostrarian numeros distintos para el mismo mes.
  const { ingresoArs: neto, gastoArs, gastoUsd, percepArs: percep, ahorroArs: ahorro, tasaAhorro: tasa, porCategoria } =
    await calcularCierre(usuarioId, periodo);

  const cats = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  // Las tres partes en que se divide el sueldo. Se agrupa en tres a proposito:
  // es lo que la paleta tiene validado y lo que una barra de este alto puede
  // mostrar sin que los segmentos chicos desaparezcan.
  const tarjetasArs = sts.reduce((s, st) => s + Number(st.totalArs), 0);
  const [sueltosDelMes, prestamosCargados] = await Promise.all([
    db.select().from(tablaGastos)
      .where(and(eq(tablaGastos.usuarioId, usuarioId), eq(tablaGastos.periodo, periodo))),
    cargarPrestamos(usuarioId),
  ]);
  const otrosArs = sueltosDelMes.reduce((s, g) => s + Number(g.montoArs), 0)
    + totalDelMes(prestamosCargados, periodo);

  // Cotizaciones en vivo, pero SOLO para el mes en curso. Un mes cerrado es un
  // registro de lo que valia entonces: repreciarlo con el valor de hoy borraria
  // justamente lo que el historico tiene que conservar.
  const esMesActual = periodo === new Date().toISOString().slice(0, 7);
  let preciosHoy: Record<string, number> = {};
  if (esMesActual && snapshots.length) {
    const [clases, ratios] = await Promise.all([clasesDeActivos(usuarioId), ratiosVigentes(usuarioId)]);
    preciosHoy = (await preciosDePortafolio(clases, ratios)).precios;
  }

  /** Valor de una posicion: el de hoy si se consiguio, si no el del snapshot. */
  const valorDe = (activo: string, cantidad: number, guardado: number | null) => {
    const hoy = preciosHoy[activo];
    if (hoy != null && Number.isFinite(hoy)) return { usd: hoy * cantidad, envivo: true };
    return { usd: guardado, envivo: false };
  };

  const pesoPercep = pesoSobreGasto(percep, gastoArs);

  const reparto = [
    { etiqueta: 'Tarjetas', valor: tarjetasArs, color: COLOR_TARJETA },
    { etiqueta: 'Servicios, alquiler y cuotas', valor: otrosArs, color: COLOR_OTROS },
    { etiqueta: 'Ahorro', valor: Math.max(0, ahorro), color: COLOR_AHORRO },
  ];

  const subs = sts.flatMap(st => st.consumos).filter(c => c.categoria === 'Suscripciones');
  const usdSubs = subs.reduce((s, c) => s + Number(c.montoUsd), 0);

  const cuotas = new Map<string, number>();
  for (const st of sts) {
    const raw = st.raw as { cuotasAVencer?: { mes: string; montoArs: number }[] };
    for (const q of raw.cuotasAVencer ?? []) cuotas.set(q.mes, (cuotas.get(q.mes) ?? 0) + q.montoArs);
  }

  return (
    <main>
      <Nav />
      <p className="eyebrow">Cierre financiero</p>
      <h1>{periodo}</h1>
      <SyncButton />

      <div className="ledger">
        <div className="celda"><p className="eyebrow">Ingreso neto</p><p className="valor ars">{fmtArs(neto)}</p></div>
        <div className="op">−</div>
        {/* Gastos y no "Tarjetas": este numero incluye los resumenes, los gastos
            sueltos (servicios, alquiler) y la cuota de los prestamos. Llamarlo
            tarjetas mandaba a buscar la diferencia al resumen, donde no estaba. */}
        <div className="celda"><p className="eyebrow">Gastos</p><p className="valor ars">{fmtArs(gastoArs)}</p><p className="monto usd" style={{ fontSize: 12 }}>{fmtUsd(gastoUsd)}</p></div>
        <div className="op">=</div>
        <div className="celda">
          <p className="eyebrow">Ahorro {tasa !== null && `(${tasa.toFixed(1)}%)`}</p>
          <p className="valor" style={{ color: ahorro >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>{fmtArs(ahorro)}</p>
        </div>
      </div>

      {neto > 0 && (
        <section>
          <h2>A dónde fue el sueldo</h2>
          <StackedBar partes={reparto} total={neto} formato="ars" />
          {ahorro < 0 && (
            <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
              Este mes gastaste {fmtArs(-ahorro)} más de lo que entró, así que no hay
              ahorro que repartir: la barra muestra en qué se fue el sueldo, no cómo
              se dividió. Puede ser real, o puede que falte cargar algún ingreso.
            </p>
          )}
        </section>
      )}

      <section>
        <h2>Gastos por categoría</h2>
        {/* Barras y no torta: acá la pregunta es cual categoria es mas grande
            que cual, y comparar largos es lo que el ojo hace bien. */}
        <BarChart
          datos={cats.map(([cat, monto]) => ({ etiqueta: cat, valor: monto }))}
          formato="ars"
        />
      </section>

      {subs.length > 0 && (
        <section>
          <h2>Suscripciones <span className="chip usd">{fmtUsd(usdSubs)}/mes</span></h2>
          {subs.map(s => (
            <div className="fila" key={s.id}><span>{s.comercio}</span><span className="monto usd">{fmtUsd(Number(s.montoUsd))}</span></div>
          ))}
        </section>
      )}

      {cuotas.size > 0 && (
        <section>
          <h2>Cuotas comprometidas</h2>
          {[...cuotas.entries()].sort().map(([mes, monto]) => (
            <div className="fila" key={mes}><span className="monto">{mes}</span><span className="monto ars">{fmtArs(monto)}</span></div>
          ))}
        </section>
      )}

      <UploadPanel />

      {percep > 0 && (
        <section>
          <h2>
            Percepciones del mes
            {pesoPercep !== null && pesoPercep >= 0.1 && (
              <span className="chip">{pesoPercep.toFixed(1)}% de tu gasto</span>
            )}
          </h2>

          <div className="fila">
            <span>
              RG 4815 / 5617 sobre {fmtUsd(gastoUsd)} de consumo
            </span>
            <span className="monto ars">{fmtArs(percep)}</span>
          </div>

          {/* El mismo monto sirve para las dos cosas, asi que se muestra una
              sola vez: repetirlo en dos filas se lee como un error de calculo.
              Lo que cambia es que hacer con el. */}
          <ul className="salidas">
            <li>
              <strong>Evitarla.</strong> Si cancelás el consumo en moneda extranjera con dólares
              propios, la percepción del {(ALICUOTA_PERCEPCION * 100).toFixed(0)}% no se aplica.
              Es plata que nunca sale del bolsillo.
            </li>
            <li>
              <strong>Recuperarla.</strong> Lo ya percibido es pago a cuenta de Ganancias o Bienes
              Personales y se tramita ante ARCA. Vuelve, pero mucho después y en pesos que para
              entonces valen menos.
            </li>
          </ul>
        </section>
      )}

      {snapshots.length > 0 && (
        <section>
          <h2>Inversiones</h2>
          {snapshots.map(s => {
            const valores = s.positions.map(p => ({
              p, ...valorDe(p.activo, Number(p.cantidad), p.valorUsd === null ? null : Number(p.valorUsd)),
            }));
            // El total se recompone de las posiciones: si alguna se repreció,
            // el total guardado en el snapshot ya no cuadra con las filas.
            const conValor = valores.filter(v => v.usd !== null);
            const total = conValor.length === valores.length
              ? conValor.reduce((acc, v) => acc + (v.usd as number), 0)
              : null;

            return (
              <div key={s.id} style={{ marginBottom: 16 }}>
                <div className="fila">
                  <strong>{s.plataforma}</strong>
                  <span className="monto usd">{total !== null ? fmtUsd(total) : '—'}</span>
                </div>
                {valores.map(({ p, usd, envivo }) => (
                  <div className="fila" key={p.id} style={{ paddingLeft: 12 }}>
                    <span>
                      {p.activo} <span className="chip">{p.clase}</span>
                      {envivo && <span className="chip">hoy</span>}
                    </span>
                    <span className="monto">
                      {usd !== null ? fmtUsd(usd) : Number(p.cantidad).toLocaleString('es-AR')}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          <p className="nota">
            {esMesActual
              ? 'Las posiciones marcadas «hoy» están a cotización de este momento. Las que no, ' +
                'quedaron con el valor de la última sincronización: no se consiguió precio y ' +
                'preferimos el dato viejo antes que inventar uno.'
              : 'Mes cerrado: los valores son los de la última sincronización de ese mes, no los de hoy. ' +
                'Repreciar el pasado borraría lo que el histórico tiene que conservar.'}
          </p>
        </section>
      )}
    </main>
  );
}
