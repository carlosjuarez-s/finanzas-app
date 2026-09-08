'use client';

import { useState } from 'react';
import { InputNumber, Select, Space } from 'antd';
import { aporteNecesario, cuantoTarda, techo } from '@/lib/plan';
import { ESTRATEGIAS, RETORNO_POR_ESTRATEGIA, type Estrategia, type Supuestos } from '@/lib/proyeccion';
import { fmtUsd, fmtArs, fmtNum1 } from '@/lib/formato';

/**
 * Los pasos para llegar a un objetivo.
 *
 * La proyeccion responde "si aporto tanto, cuanto tengo". Esto responde las dos
 * preguntas que uno se hace de verdad frente a una meta: cuanto tengo que
 * aportar para llegar, y con lo que puedo hoy, cuanto tardo.
 *
 * Es la misma formula despejada al reves, sobre el mismo modelo: si usara otro,
 * las dos pantallas darian numeros distintos del mismo plan.
 */
export default function Pasos({ supuestos, aporteActualUsd, saldoInicialUsd, ingresoMensualArs }: {
  supuestos: Supuestos;
  aporteActualUsd: number;
  saldoInicialUsd: number;
  ingresoMensualArs: number;
}) {
  const [objetivo, setObjetivo] = useState<number | null>(20_000);
  const [años, setAños] = useState(5);
  const [estrategia, setEstrategia] = useState<Estrategia>('INDICE');

  const tasa = RETORNO_POR_ESTRATEGIA(supuestos)[estrategia];
  const meses = años * 12;
  const meta = objetivo ?? 0;

  const necesario = aporteNecesario({ objetivo: meta, meses, tasaAnualPct: tasa, saldoInicial: saldoInicialUsd });
  const conLoDeHoy = cuantoTarda({ objetivo: meta, aporteMensual: aporteActualUsd, tasaAnualPct: tasa, saldoInicial: saldoInicialUsd });

  const brecha = necesario === null ? null : necesario - aporteActualUsd;
  const enPesos = (usd: number) => supuestos.tipoCambioArs > 0 ? usd * supuestos.tipoCambioArs : 0;
  const pctDelIngreso = (usd: number) =>
    ingresoMensualArs > 0 ? Math.round((enPesos(usd) / ingresoMensualArs) * 100) : null;

  return (
    <section>
      <h2>Qué pasos tengo que dar</h2>

      <Space wrap style={{ marginBottom: 4 }}>
        <InputNumber
          value={objetivo} onChange={setObjetivo} min={0} prefix="U$S"
          style={{ width: 170 }} aria-label="Objetivo en dólares" placeholder="Objetivo"
        />
        <InputNumber
          value={años} onChange={v => setAños(v ?? 1)} min={1} max={40} suffix="años"
          style={{ width: 130 }} aria-label="En cuántos años"
        />
        <Select
          value={estrategia} onChange={setEstrategia} style={{ width: 190 }} aria-label="Con qué estrategia"
          options={ESTRATEGIAS.map(e => ({ value: e.id, label: e.nombre }))}
        />
      </Space>

      {meta <= 0 ? (
        <p className="resultado">Poné un objetivo y te digo cuánto hay que aportar por mes.</p>
      ) : necesario === null ? (
        <p className="resultado">Poné un objetivo y un plazo de al menos un mes.</p>
      ) : necesario === 0 ? (
        <p className="resultado">
          Con lo que ya tenés ahorrado ({fmtUsd(saldoInicialUsd)}) llegás a {fmtUsd(meta)} en{' '}
          {años} {años === 1 ? 'año' : 'años'} sin poner un peso más, solo por el interés.
        </p>
      ) : (
        <>
          <div className="ledger">
            <div className="celda">
              <p className="eyebrow">Tenés que aportar</p>
              <p className="valor ars">{fmtUsd(necesario)}<span style={{ fontSize: 13 }}>/mes</span></p>
              <p className="monto" style={{ fontSize: 12 }}>
                {fmtArs(enPesos(necesario))}
                {pctDelIngreso(necesario) !== null && ` · ${pctDelIngreso(necesario)}% del ingreso`}
              </p>
            </div>
            <div className="op">−</div>
            <div className="celda">
              <p className="eyebrow">Hoy aportás</p>
              <p className="valor ars">{fmtUsd(aporteActualUsd)}<span style={{ fontSize: 13 }}>/mes</span></p>
            </div>
            <div className="op">=</div>
            <div className="celda">
              <p className="eyebrow">{brecha !== null && brecha > 0 ? 'Te falta' : 'Te sobra'}</p>
              <p
                className="valor"
                style={{ color: brecha !== null && brecha > 0 ? 'var(--alerta)' : 'var(--dolar)' }}
              >
                {fmtUsd(Math.abs(brecha ?? 0))}
              </p>
            </div>
          </div>

          {/* El paso concreto, en la moneda en la que uno decide: pesos por mes. */}
          {brecha !== null && brecha > 0 && (
            <p className="resultado">
              El paso es <strong>{fmtArs(enPesos(brecha))} más por mes</strong>. Sale de recortar
              gastos por ese monto, de que suba el ingreso, o de estirar el plazo.
            </p>
          )}

          <ol className="pasos-plan">
            <li>
              <strong>Con lo que aportás hoy</strong> ({fmtUsd(aporteActualUsd)}/mes):{' '}
              {conLoDeHoy.ok
                ? conLoDeHoy.meses === 0
                  ? 'ya llegaste.'
                  : `llegás en ${conLoDeHoy.meses} meses (${fmtNum1(conLoDeHoy.meses / 12)} años).`
                : conLoDeHoy.motivo === 'sin-aporte'
                  ? 'no llegás nunca, porque no estás aportando nada.'
                  : `no llegás nunca. Con esa tasa el saldo tiene techo en ${fmtUsd(conLoDeHoy.techo)} y ahí se queda.`}
            </li>
            <li>
              <strong>Para llegar en {años} {años === 1 ? 'año' : 'años'}</strong>: {fmtUsd(necesario)} por mes,
              o sea {fmtArs(enPesos(necesario))}.
            </li>
            <li>
              <strong>De dónde sale</strong>: mirá los gastos fijos del mes en Gastos → Debo. Es
              donde un recorte se repite solo todos los meses, en vez de tener que acordarse.
            </li>
          </ol>

          {tasa < 0 && (
            <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
              Con {ESTRATEGIAS.find(e => e.id === estrategia)?.nombre.toLowerCase()} el retorno real
              es negativo ({tasa}% anual), así que el saldo tiene un techo:{' '}
              {fmtUsd(techo(necesario, tasa))} aportando eso. Más allá de ahí, lo que pierde el
              saldo iguala a lo que entra y no sube más, aportes el tiempo que aportes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
