import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transacciones } from '@/db/schema';
import { resultadosPorActivo, discrepancias, ratiosVigentes, clasesDeActivos } from '@/lib/sync-portafolio';
import { preciosDePortafolio } from '@/lib/precios';
import { fmtUsd, fmtPct } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import AltaTransaccion from './alta-transaccion';
import Actualizar from './actualizar';
import { ultimasFotos, seriePorPeriodo } from '@/lib/conciliar';
import { cargarFotos } from '@/lib/conciliar-servidor';
import Operaciones, { type Operacion } from './operaciones';
import BarChart from '../bar-chart';
import LineChart from '../line-chart';
import { historial, variacion, type SnapshotPeriodo } from '@/lib/historial-portafolio';
import { fmtPeriodo } from '@/lib/formato';
import { idUsuarioActual } from '@/lib/usuario';
import Monto from '../monto';

export const dynamic = 'force-dynamic';

export default async function Portafolio() {
  const usuarioId = await idUsuarioActual();
  let resultados, errores, tenencias, ops: Operacion[] = [];
  let sinPrecio: string[] = [];
  let serie: SnapshotPeriodo[] = [];
  try {
    // Lo que tenes hoy es la ULTIMA foto de cada cuenta. Antes se sumaban las
    // ultimas 8 fotos, y si IOL tenia agosto y septiembre, todo lo que no se
    // movio entre un mes y otro contaba doble.
    const fotos = await cargarFotos(usuarioId);
    tenencias = ultimasFotos(fotos).flatMap(f => f.tenencias.map(t => ({
      activo: t.activo, cantidad: t.cantidad, plataforma: f.plataforma, valorUsd: t.valorUsd,
    })));

    // Precio implicito de lo que informo el broker en el ultimo snapshot: sirve
    // de piso cuando la cotizacion en vivo no se consigue.
    const precios: Record<string, number> = {};
    for (const t of tenencias) {
      if (t.valorUsd !== null && t.cantidad > 0) precios[t.activo] = t.valorUsd / t.cantidad;
    }

    // Cotizaciones en vivo. Si la red falla, cada fuente devuelve vacio y quedan
    // los precios del snapshot: nunca se muestra un cero como si fuera un valor.
    const [clases, ratios] = await Promise.all([clasesDeActivos(usuarioId), ratiosVigentes(usuarioId)]);
    const enVivo = await preciosDePortafolio(clases, ratios);
    Object.assign(precios, enVivo.precios);
    sinPrecio = enVivo.sinPrecio;

    ({ resultados, errores } = await resultadosPorActivo(usuarioId, precios));

    // Mes a mes, arrastrando la ultima foto de cada cuenta: actualizar solo
    // IOL en septiembre no puede hacer caer el total lo que vale Binance.
    serie = seriePorPeriodo(fotos);
    ops = (await db.select().from(transacciones)
      .where(eq(transacciones.usuarioId, usuarioId))
      .orderBy(desc(transacciones.fecha))).map(t => ({
      id: t.id, activo: t.activo, tipo: t.tipo, fecha: t.fecha,
      cantidad: Number(t.cantidad), precioUnitario: Number(t.precioUnitario),
      moneda: t.moneda, tipoCambioDia: t.tipoCambioDia === null ? null : Number(t.tipoCambioDia),
      comision: Number(t.comision), origen: t.origen,
    }));
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Portafolio" />;
  }

  // Cuanto pusiste vs cuanto vale. Se calcula sobre el libro de operaciones,
  // que es lo que distingue "crecio porque aporte" de "crecio porque rindio".
  const hist = historial(serie, ops.map(o => ({
    activo: o.activo,
    tipo: o.tipo === 'VENTA' ? 'VENTA' as const : 'COMPRA' as const,
    fecha: o.fecha,
    cantidad: o.cantidad,
    precioUnitario: o.precioUnitario,
    moneda: o.moneda === 'ARS' ? 'ARS' as const : 'USD' as const,
    tipoCambioDia: o.tipoCambioDia,
    comision: o.comision,
  })));
  const v = variacion(hist.puntos);

  // Una tenencia por activo, sumando plataformas.
  const consolidado = new Map<string, { cantidad: number; valorUsd: number | null; plataformas: Set<string> }>();
  for (const t of tenencias) {
    const acc = consolidado.get(t.activo) ?? { cantidad: 0, valorUsd: 0 as number | null, plataformas: new Set<string>() };
    acc.cantidad += t.cantidad;
    acc.valorUsd = acc.valorUsd === null || t.valorUsd === null ? null : acc.valorUsd + t.valorUsd;
    acc.plataformas.add(t.plataforma);
    consolidado.set(t.activo, acc);
  }

  const totalUsd = [...consolidado.values()].reduce((s, v) => s + (v.valorUsd ?? 0), 0);
  const invertidoUsd = resultados.reduce((s, r) => s + r.costoTotalUsd, 0);
  const noRealizado = resultados.reduce((s, r) => s + (r.noRealizadoUsd ?? 0), 0);
  const realizado = resultados.reduce((s, r) => s + r.realizadoUsd, 0);

  const composicion = [...consolidado.entries()]
    .filter(([, v]) => v.valorUsd !== null && v.valorUsd > 0)
    .sort((a, b) => (b[1].valorUsd ?? 0) - (a[1].valorUsd ?? 0))
    .map(([activo, v]) => ({ etiqueta: activo, valor: v.valorUsd as number }));

  // Solo los que tienen costo cargado: sin precio de entrada no hay resultado
  // que mostrar, y una barra en cero se leeria como "no gane nada".
  const resultadoPorActivo = resultados
    .filter(r => r.noRealizadoUsd !== null && r.costoTotalUsd > 0)
    .sort((a, b) => (b.noRealizadoUsd ?? 0) - (a.noRealizadoUsd ?? 0))
    .map(r => ({
      etiqueta: r.activo,
      valor: r.noRealizadoUsd as number,
      nota: `Costo ${fmtUsd(r.costoTotalUsd)} · hoy ${fmtUsd(r.valorActualUsd ?? 0)}`,
    }));

  const avisos = discrepancias(
    resultados,
    [...consolidado.entries()].map(([activo, v]) => ({ activo, cantidad: v.cantidad })),
  );

  return (
    <main>
      <Nav />
      <p className="eyebrow">Portafolio</p>
      <h1>Tenencias y resultado</h1>

      <div className="ledger">
        <div className="celda">
          <p className="eyebrow">Valor hoy</p>
          <p className="valor usd">{totalUsd ? fmtUsd(totalUsd) : '—'}</p>
        </div>
        <div className="op">−</div>
        <div className="celda">
          <p className="eyebrow">Invertido</p>
          <p className="valor usd">{invertidoUsd ? fmtUsd(invertidoUsd) : '—'}</p>
        </div>
        <div className="op">=</div>
        <div className="celda">
          <p className="eyebrow">Sin realizar</p>
          <p className="valor"><Monto valor={invertidoUsd ? noRealizado : null} moneda="USD" /></p>
        </div>
      </div>

      <Actualizar />

      {avisos.length > 0 && (
        <section>
          <h2>Revisar</h2>
          {/* Preferimos avisar antes que mostrar con confianza un numero mal. */}
          {avisos.map(a => (
            <p className="nota" key={a.activo} style={{ borderLeftColor: 'var(--alerta)' }}>{a.mensaje}</p>
          ))}
        </section>
      )}

      {errores.map((e, i) => (
        <p className="nota" key={i} style={{ borderLeftColor: 'var(--alerta)' }}>{e}</p>
      ))}

      {sinPrecio.length > 0 && (
        <p className="nota">
          Sin cotización para {sinPrecio.join(', ')}. Se muestra «—» en vez de un cero:
          no saber cuánto vale algo y que valga cero son cosas distintas.
        </p>
      )}

      {hist.puntos.length >= 2 && (
        <section>
          <h2>Cómo viene creciendo</h2>
          <LineChart
            etiquetas={hist.puntos.map(p => fmtPeriodo(p.periodo))}
            series={[
              { nombre: 'Valor', valores: hist.puntos.map(p => p.valorUsd ?? 0) },
              { nombre: 'Aportado', valores: hist.puntos.map(p => p.aportadoUsd) },
            ]}
            formato="usd"
            unidad="USD"
          />

          {/* La distancia entre las dos lineas ES el resultado. Sin la segunda,
              un mes en que aportaste y el mercado cayo se ve como crecimiento. */}
          {v && (
            <p className="nota">
              Entre {fmtPeriodo(v.desde)} y {fmtPeriodo(v.hasta)} el portafolio pasó de{' '}
              {fmtUsd(v.valorInicialUsd)} a {fmtUsd(v.valorFinalUsd)}: subió {fmtUsd(v.cambioUsd)}.
              De eso, {fmtUsd(v.aportadoUsd)} lo pusiste vos, así que el mercado te{' '}
              {v.rendimientoUsd >= 0 ? 'dio' : 'sacó'} {fmtUsd(Math.abs(v.rendimientoUsd))}.
            </p>
          )}

          <p className="nota">
            Las dos líneas juntas son la única forma de saber si te fue bien: si solo mirás el
            valor, un mes en que aportaste y el mercado cayó se ve igual que uno en que rendiste.
            La distancia entre ellas es tu resultado.
          </p>

          {hist.operacionesSinConvertir > 0 && (
            <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
              {hist.operacionesSinConvertir}{' '}
              {hist.operacionesSinConvertir === 1 ? 'operación en pesos no tiene' : 'operaciones en pesos no tienen'}{' '}
              el dólar de su día y quedaron fuera del aportado. Completalas abajo para que la
              línea sea real.
            </p>
          )}
        </section>
      )}

      {composicion.length > 1 && (
        <section>
          <h2>Composición</h2>
          <BarChart datos={composicion} formato="usd" />
          <p className="nota">
            Cuánto pesa cada activo en el total. Es lo que muestra si estás más concentrado
            de lo que creías.
          </p>
        </section>
      )}

      {resultadoPorActivo.length > 0 && (
        <section>
          <h2>Ganancia y pérdida por activo</h2>
          <BarChart datos={resultadoPorActivo} formato="usd" divergente />
          <p className="nota">
            En dólares, contra lo que pagaste. Las barras crecen desde el cero del medio:
            a la derecha ganancia, a la izquierda pérdida.
          </p>
        </section>
      )}

      <section>
        <h2>Por activo</h2>
        {!consolidado.size && !resultados.length && (
          <p className="resultado">
            Sin tenencias ni operaciones. Conectá una cuenta o anotá una operación acá abajo.
          </p>
        )}

        {[...consolidado.entries()].sort((a, b) => (b[1].valorUsd ?? 0) - (a[1].valorUsd ?? 0)).map(([activo, v]) => {
          const r = resultados.find(x => x.activo === activo);
          return (
            <div className="fila" key={activo}>
              <span>
                <strong>{activo}</strong>
                <span className="chip">{[...v.plataformas].join(', ')}</span>
                <span className="resultado" style={{ display: 'block' }}>
                  {v.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 8 })} unidades
                  {r && r.cantidad > 0 && ` · costo ${fmtUsd(r.costoUnitarioUsd)} c/u`}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className="monto usd">{v.valorUsd !== null ? fmtUsd(v.valorUsd) : '—'}</span>
                {r?.noRealizadoUsd != null && (
                  <span style={{ display: 'block' }}>
                    <Monto valor={r.noRealizadoUsd} moneda="USD" tamano={12} />
                    {r.retornoPct !== null && (
                      <span className="monto" style={{ fontSize: 12 }}> ({fmtPct(r.retornoPct)})</span>
                    )}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {/* Activos con operaciones cargadas pero sin tenencia informada. */}
        {resultados.filter(r => r.cantidad > 0 && !consolidado.has(r.activo)).map(r => (
          <div className="fila" key={r.activo}>
            <span>
              <strong>{r.activo}</strong>
              <span className="chip">solo libro</span>
              <span className="resultado" style={{ display: 'block' }}>
                {r.cantidad} unidades · costo {fmtUsd(r.costoUnitarioUsd)} c/u
              </span>
            </span>
            <span className="monto usd">{fmtUsd(r.costoTotalUsd)}</span>
          </div>
        ))}
      </section>

      {realizado !== 0 && (
        <section>
          <h2>Ya realizado</h2>
          <div className="fila">
            <span>Resultado de lo que vendiste</span>
            <Monto valor={realizado} moneda="USD" />
          </div>
        </section>
      )}

      {ops.some(o => o.origen === 'AJUSTE') && (
        <p className="nota">
          Las operaciones marcadas «ajuste» salieron de actualizar una cuenta, no de una compra
          o venta anotada una por una. Si el precio fue el de ese día y compraste antes,
          corregilo abajo: es lo que usa el cálculo de ganancia.
        </p>
      )}

      <Operaciones operaciones={ops} />

      <AltaTransaccion />

      {!ops.length && (
        <p className="nota">
          Sin operaciones cargadas solo se ve cuánto tenés, no cuánto ganaste: una foto del
          portafolio no dice a qué precio compraste. Anotá las compras y aparece el resultado.
        </p>
      )}

      <p className="nota">
        Todo en dólares. Medir en pesos con esta inflación da la respuesta opuesta: un activo
        puede subir 50% en pesos y ser una pérdida en poder de compra.
      </p>
    </main>
  );
}
