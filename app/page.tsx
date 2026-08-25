import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, portfolioSnapshots } from '@/db/schema';
import { calcularCierre } from '@/lib/cierre';
import { fmtArs, fmtUsd } from '@/lib/formato';
import Nav from './nav';
import SyncButton from './sync-button';
import UploadPanel from './upload-panel';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: qp } = await searchParams;
  const ultimo = await db.query.statements.findFirst({ orderBy: desc(statements.periodo), columns: { periodo: true } });
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

  const sts = await db.query.statements.findMany({ where: eq(statements.periodo, periodo), with: { consumos: true } });
  const snapshots = await db.query.portfolioSnapshots.findMany({
    where: eq(portfolioSnapshots.periodo, periodo),
    with: { positions: true },
  });

  // Mismo calculo que persiste el historico: si divergieran, el dashboard y los
  // graficos mostrarian numeros distintos para el mismo mes.
  const { ingresoArs: neto, gastoArs, gastoUsd, percepArs: percep, ahorroArs: ahorro, tasaAhorro: tasa, porCategoria } =
    await calcularCierre(periodo);

  const cats = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;

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
        <div className="celda"><p className="eyebrow">Tarjetas</p><p className="valor ars">{fmtArs(gastoArs)}</p><p className="monto usd" style={{ fontSize: 12 }}>{fmtUsd(gastoUsd)}</p></div>
        <div className="op">=</div>
        <div className="celda">
          <p className="eyebrow">Ahorro {tasa !== null && `(${tasa.toFixed(1)}%)`}</p>
          <p className="valor" style={{ color: ahorro >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>{fmtArs(ahorro)}</p>
        </div>
      </div>

      <section>
        <h2>Gastos por categoria</h2>
        {cats.map(([cat, monto]) => (
          <div key={cat} style={{ padding: '8px 0' }}>
            <div className="fila" style={{ border: 'none', padding: 0 }}>
              <span>{cat}</span>
              <span className="monto ars">{fmtArs(monto)}</span>
            </div>
            <div className="barra" style={{ width: `${(monto / maxCat) * 100}%` }} />
          </div>
        ))}
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

      <section>
        <h2>Percepciones recuperables</h2>
        <div className="fila"><span>RG 4815 / 5617 del mes (tramitar ante ARCA)</span><span className="monto ars">{fmtArs(percep)}</span></div>
      </section>

      {snapshots.length > 0 && (
        <section>
          <h2>Inversiones</h2>
          {snapshots.map(s => (
            <div key={s.id} style={{ marginBottom: 16 }}>
              <div className="fila"><strong>{s.plataforma}</strong><span className="monto usd">{s.totalUsd ? fmtUsd(Number(s.totalUsd)) : '—'}</span></div>
              {s.positions.map(p => (
                <div className="fila" key={p.id} style={{ paddingLeft: 12 }}>
                  <span>{p.activo} <span className="chip">{p.clase}</span></span>
                  <span className="monto">{p.valorUsd ? fmtUsd(Number(p.valorUsd)) : Number(p.cantidad)}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
