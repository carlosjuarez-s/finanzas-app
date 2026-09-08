'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InputNumber, Slider, Space, Typography } from 'antd';
import {
  proyectar, ESTRATEGIAS, type Supuestos, type Estrategia,
} from '@/lib/proyeccion';
import { reparto } from '@/lib/plan';
import { fmtUsd, fmtUsdEntero, fmtNumEntero, fmtArs, fmtPeriodo } from '@/lib/formato';
import Pasos from './pasos';
import LineChart from '../line-chart';

const { Text } = Typography;

type Props = {
  supuestos: Supuestos;
  ingresoMensualArs: number;
  gastoMensualArs: number;
  mesesDeDatos: number;
  ahorroAcumuladoUsd: number;
};

export default function Simulador({
  supuestos: iniciales, ingresoMensualArs, gastoMensualArs, mesesDeDatos, ahorroAcumuladoUsd,
}: Props) {
  // Tasa observada: cuanto ahorra realmente hoy, para que el slider arranque en
  // la realidad y no en un numero redondo inventado.
  const tasaObservada = ingresoMensualArs > 0
    ? Math.round(((ingresoMensualArs - gastoMensualArs) / ingresoMensualArs) * 100)
    : 20;

  const [tasa, setTasa] = useState(Math.max(0, Math.min(100, tasaObservada)));
  const [años, setAños] = useState(5);
  const [supuestos, setSupuestos] = useState(iniciales);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const aporteMensualUsd = supuestos.tipoCambioArs > 0
    ? (ingresoMensualArs * (tasa / 100)) / supuestos.tipoCambioArs
    : 0;

  const puntos = useMemo(() => proyectar({
    aporteMensualUsd, meses: años * 12, supuestos, saldoInicialUsd: ahorroAcumuladoUsd,
  }), [aporteMensualUsd, años, supuestos, ahorroAcumuladoUsd]);

  const final = puntos[puntos.length - 1];
  // Un punto por mes satura el eje a 30 años; con uno por trimestre alcanza.
  const paso = Math.max(1, Math.round(puntos.length / 24));
  const muestra = puntos.filter((_, i) => i % paso === 0 || i === puntos.length - 1);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/supuestos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supuestos),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof Supuestos, etiqueta: string, sufijo: string, ayuda: string) => (
    <div className="supuesto" key={k}>
      <span>
        {etiqueta}
        <span className="resultado" style={{ display: 'block' }}>{ayuda}</span>
      </span>
      <InputNumber
        value={supuestos[k]}
        onChange={v => setSupuestos(s => ({ ...s, [k]: Number(v ?? 0) }))}
        suffix={sufijo}
        style={{ width: 130 }}
      />
    </div>
  );

  return (
    <>
      <section>
        <h2>Qué pasa si ahorro…</h2>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <p className="eyebrow">Tasa de ahorro: {tasa}% del ingreso</p>
            <Slider min={0} max={80} value={tasa} onChange={setTasa} />
            {ingresoMensualArs > 0 && (
              <Text type="secondary" className="resultado">
                Hoy ahorrás {tasaObservada}% según {mesesDeDatos} {mesesDeDatos === 1 ? 'mes' : 'meses'} de datos.
                Con {tasa}% aportarías {fmtUsd(aporteMensualUsd)} por mes.
              </Text>
            )}
          </div>

          <div>
            <p className="eyebrow">Horizonte: {años} {años === 1 ? 'año' : 'años'}</p>
            <Slider min={1} max={30} value={años} onChange={setAños} />
          </div>
        </Space>
      </section>

      <div className="ledger">
        {ESTRATEGIAS.map(e => (
          <div className="celda" key={e.id}>
            <p className="eyebrow">{e.nombre}</p>
            <p
              className="valor"
              style={{ color: final.saldos[e.id as Estrategia] >= final.aportado ? 'var(--dolar)' : 'var(--alerta)' }}
            >
              {fmtUsd(final.saldos[e.id as Estrategia])}
            </p>
          </div>
        ))}
      </div>

      <section>
        <h2>Evolución en dólares de hoy</h2>
        {/* La linea de "Aportado" es la que hace visible el interes compuesto:
            la distancia entre ella y cada estrategia ES el rendimiento. Sin
            ella el grafico muestra tres curvas que suben y no se sabe cuanto
            de esa subida la pusiste vos. */}
        <LineChart
          etiquetas={muestra.map(p => fmtPeriodo(p.periodo))}
          series={[
            { nombre: 'Aportado', valores: muestra.map(p => p.aportado), referencia: true },
            ...ESTRATEGIAS.map(e => ({
              nombre: e.nombre,
              valores: muestra.map(p => p.saldos[e.id as Estrategia]),
            })),
          ]}
          formato="corto"
          unidad="USD reales"
        />
        <p className="nota">
          La línea <strong>Aportado</strong> es la plata que pusiste vos: {fmtUsd(final.aportado)} en
          total. Lo que hay por encima lo puso el interés, que se compone mes a mes sobre el
          saldo anterior. Todo está en dólares de hoy: los retornos ya descuentan inflación, así
          que un peso del gráfico compra lo mismo el primer mes que el último.
        </p>
      </section>

      <section>
        <h2>Cuánto lo puso el interés</h2>
        {/* "Pusiste" no es una columna: el aporte no depende de la estrategia, es
            el mismo numero repetido tres veces. Sacarlo de la tabla y decirlo una
            sola vez deja entrar las tres columnas en un telefono de 320px. */}
        <p className="resultado">
          En {años} {años === 1 ? 'año' : 'años'} vas a poner{' '}
          <strong>{fmtUsdEntero(final.aportado)}</strong> de tu bolsillo. Es el mismo aporte en
          las tres estrategias: lo que cambia es lo que el interés hace con él.
        </p>
        <div className="tabla">
          <table className="bimoneda">
            <thead>
              <tr><th></th><th>Interés (U$S)</th><th>Total (U$S)</th></tr>
            </thead>
            <tbody>
              {ESTRATEGIAS.map(e => {
                const saldo = final.saldos[e.id as Estrategia];
                const r = reparto(saldo, final.aportado);
                return (
                  <tr key={e.id}>
                    <td>{e.nombre}</td>
                    <td className="monto" style={{ color: r.rendimiento >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>
                      {r.rendimiento >= 0 ? '+' : ''}{fmtNumEntero(r.rendimiento)}
                      {saldo > 0 && ` (${Math.round(r.pctRendimiento)}%)`}
                    </td>
                    <td className="monto">{fmtNumEntero(saldo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="nota">
          En pesos quietos el «interés» es negativo: no es un error, es lo que pierde el
          poder de compra frente al dólar.
        </p>
      </section>

      <Pasos
        supuestos={supuestos}
        aporteActualUsd={aporteMensualUsd}
        saldoInicialUsd={ahorroAcumuladoUsd}
        ingresoMensualArs={ingresoMensualArs}
      />

      <section>
        <h2>Supuestos</h2>
        <p className="resultado">
          Son tuyos y editables. Cambian todo lo de arriba, incluidas las fechas de las metas.
        </p>
        {campo('tipoCambioArs', 'Tipo de cambio', 'ARS/USD', 'Pesos por dólar, hoy.')}
        {campo('retornoRealPesos', 'Pesos quietos', '% anual', 'Cuánto poder de compra pierden por año contra el dólar.')}
        {campo('retornoRealDolares', 'Dólares quietos', '% anual', 'Retorno real de tener dólares sin invertir.')}
        {campo('retornoRealIndice', 'Índice S&P 500', '% anual', 'Retorno real. ~7% es el promedio histórico de largo plazo.')}

        <Space style={{ marginTop: 12 }}>
          <Button type="primary" onClick={guardar} loading={guardando}>Guardar supuestos</Button>
          {error && <Text type="danger" className="resultado">{error}</Text>}
        </Space>

        <p className="nota">
          Esto proyecta supuestos, no predice el mercado. El 7% del índice es un promedio de
          décadas que incluye caídas de más del 30%: ningún año concreto se parece al
          promedio. No es una recomendación de inversión.
        </p>
      </section>
    </>
  );
}
