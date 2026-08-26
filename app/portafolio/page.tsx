import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { portfolioSnapshots, transacciones } from '@/db/schema';
import { resultadosPorActivo, discrepancias } from '@/lib/sync-portafolio';
import { fmtUsd, fmtPct } from '@/lib/formato';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import AltaTransaccion from './alta-transaccion';

export const dynamic = 'force-dynamic';

export default async function Portafolio() {
  let resultados, errores, tenencias, hayTx = false;
  try {
    // Ultimo snapshot de cada plataforma: es lo que el broker dice que tenes.
    const snaps = await db.query.portfolioSnapshots.findMany({
      orderBy: desc(portfolioSnapshots.periodo), with: { positions: true }, limit: 8,
    });
    tenencias = snaps.flatMap(s => s.positions.map(p => ({
      activo: p.activo, cantidad: Number(p.cantidad), plataforma: s.plataforma,
      valorUsd: p.valorUsd === null ? null : Number(p.valorUsd),
    })));

    // Precio implicito de lo que informa el broker: valor / cantidad. Cuando haya
    // una fuente de cotizaciones propia, se reemplaza por ella.
    const precios: Record<string, number> = {};
    for (const t of tenencias) {
      if (t.valorUsd !== null && t.cantidad > 0) precios[t.activo] = t.valorUsd / t.cantidad;
    }

    ({ resultados, errores } = await resultadosPorActivo(precios));
    hayTx = (await db.select({ id: transacciones.id }).from(transacciones).limit(1)).length > 0;
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Portafolio" />;
  }

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
          <p className="valor" style={{ color: noRealizado >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>
            {invertidoUsd ? fmtUsd(noRealizado) : '—'}
          </p>
        </div>
      </div>

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
                  <span
                    className="monto"
                    style={{ display: 'block', fontSize: 12, color: r.noRealizadoUsd >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}
                  >
                    {r.noRealizadoUsd >= 0 ? '+' : ''}{fmtUsd(r.noRealizadoUsd)}
                    {r.retornoPct !== null && ` (${fmtPct(r.retornoPct)})`}
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
            <span className="monto" style={{ color: realizado >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>
              {fmtUsd(realizado)}
            </span>
          </div>
        </section>
      )}

      <AltaTransaccion />

      {!hayTx && (
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
