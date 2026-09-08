'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InputNumber, Segmented, Select, Slider, Space, Typography } from 'antd';
import {
  proyectar, ESTRATEGIAS, type Supuestos, type Estrategia,
} from '@/lib/proyeccion';
import { reparto, mesAMes } from '@/lib/plan';
import { sumarMeses } from '@/lib/prestamos';
import { fmtUsd, fmtUsdEntero, fmtNumEntero, fmtNumConSigno, fmtArs, fmtPeriodo, agruparMiles, desagruparMiles } from '@/lib/formato';
import Pasos from './pasos';
import LineChart from '../line-chart';

const { Text } = Typography;

type Props = {
  supuestos: Supuestos;
  ingresoMensualArs: number;
  gastoMensualArs: number;
  mesesDeDatos: number;
  ahorroAcumuladoUsd: number;
  // El mes en curso llega del servidor y no se calcula aca: un `new Date()` en
  // el render de un componente de cliente se evalua tambien en el SSR, y las
  // dos corridas pueden caer en meses distintos.
  hoy: string;
};

export default function Simulador({
  supuestos: iniciales, ingresoMensualArs, gastoMensualArs, mesesDeDatos, ahorroAcumuladoUsd, hoy,
}: Props) {
  // Tasa observada: cuanto ahorra realmente hoy, para que el slider arranque en
  // la realidad y no en un numero redondo inventado.
  const tasaObservada = ingresoMensualArs > 0
    ? Math.round(((ingresoMensualArs - gastoMensualArs) / ingresoMensualArs) * 100)
    : 20;

  const [tasa, setTasa] = useState(Math.max(0, Math.min(100, tasaObservada)));
  const [años, setAños] = useState(5);
  const [modo, setModo] = useState<'PCT' | 'MONTO'>('PCT');
  const [monto, setMonto] = useState<number | null>(null);
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [desde, setDesde] = useState(hoy);
  const [estrategiaTabla, setEstrategiaTabla] = useState<Estrategia>('INDICE');
  const [supuestos, setSupuestos] = useState(iniciales);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Dos formas de decir cuanto se aporta, y hacen falta las dos: el porcentaje
  // sirve para pensar ("¿y si ahorro el 30%?"), el monto sirve para decidir
  // ("puedo poner 200.000 por mes"). Una sola obligaba a hacer la cuenta a mano.
  const aportePorTasa = supuestos.tipoCambioArs > 0
    ? (ingresoMensualArs * (tasa / 100)) / supuestos.tipoCambioArs
    : 0;

  // Sin monto escrito, el campo arranca en lo que da el slider: cambiar de modo
  // no deberia borrar el escenario que uno venia mirando.
  const montoSugerido = Math.round(
    moneda === 'ARS' ? aportePorTasa * supuestos.tipoCambioArs : aportePorTasa,
  );
  const montoEfectivo = monto ?? montoSugerido;
  const aMoneda = (n: number) => moneda === 'USD'
    ? n
    : supuestos.tipoCambioArs > 0 ? n / supuestos.tipoCambioArs : 0;

  const aporteMensualUsd = modo === 'PCT' ? aportePorTasa : aMoneda(montoEfectivo);

  // Cambiar de moneda no cambia de plata: se convierte lo escrito. Dejar el
  // numero tal cual convertiria 200.000 pesos en 200.000 dolares sin avisar.
  function cambiarMoneda(m: 'ARS' | 'USD') {
    if (monto !== null && supuestos.tipoCambioArs > 0) {
      setMonto(Math.round(m === 'USD' ? monto / supuestos.tipoCambioArs : monto * supuestos.tipoCambioArs));
    }
    setMoneda(m);
  }

  // Dos años de arranques posibles. Mas que eso no es un plan, es una intencion.
  const arranques = useMemo(() => Array.from({ length: 24 }, (_, i) => sumarMeses(hoy, i)), [hoy]);

  const puntos = useMemo(() => proyectar({
    aporteMensualUsd, meses: años * 12, supuestos, saldoInicialUsd: ahorroAcumuladoUsd, desde,
  }), [aporteMensualUsd, años, supuestos, ahorroAcumuladoUsd, desde]);

  const filas = useMemo(() => mesAMes(puntos, estrategiaTabla), [puntos, estrategiaTabla]);

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
            <Segmented
              value={modo}
              onChange={v => setModo(v as 'PCT' | 'MONTO')}
              options={[
                { value: 'PCT', label: '% del ingreso' },
                { value: 'MONTO', label: 'Monto fijo' },
              ]}
              // "middle" deja el control en 28px de alto, por debajo del minimo
              // tactil que exige scripts/responsive.mjs. Con "large" son 40.
              size="large"
              style={{ marginBottom: 10 }}
            />

            {modo === 'PCT' ? (
              <>
                <p className="eyebrow">Tasa de ahorro: {tasa}% del ingreso</p>
                <Slider min={0} max={80} value={tasa} onChange={setTasa} />
                {ingresoMensualArs > 0 && (
                  <Text type="secondary" className="resultado" style={{ display: 'block', marginTop: 6 }}>
                    Hoy ahorrás {tasaObservada}% según {mesesDeDatos} {mesesDeDatos === 1 ? 'mes' : 'meses'} de datos.
                    Con {tasa}% aportarías {fmtUsd(aporteMensualUsd)} por mes.
                  </Text>
                )}
              </>
            ) : (
              <>
                <p className="eyebrow">Cuánto pongo por mes</p>
                <Space wrap>
                  <InputNumber
                    value={montoEfectivo} onChange={setMonto} min={0} step={1000}
                    size="large" style={{ width: 170 }} aria-label="Monto que aporto por mes"
                    prefix={moneda === 'ARS' ? '$' : 'U$S'}
                    formatter={agruparMiles} parser={desagruparMiles}
                  />
                  <Segmented
                    value={moneda}
                    onChange={v => cambiarMoneda(v as 'ARS' | 'USD')}
                    options={[{ value: 'ARS', label: 'pesos' }, { value: 'USD', label: 'dólares' }]}
                    size="large" aria-label="En qué moneda"
                  />
                </Space>
                <Text type="secondary" className="resultado" style={{ display: 'block', marginTop: 6 }}>
                  {moneda === 'ARS'
                    ? `Son ${fmtUsd(aporteMensualUsd)} por mes al tipo de cambio de ${fmtArs(supuestos.tipoCambioArs)}.`
                    : `Son ${fmtArs(aporteMensualUsd * supuestos.tipoCambioArs)} por mes al tipo de cambio de ${fmtArs(supuestos.tipoCambioArs)}.`}
                  {ingresoMensualArs > 0 && ` Es el ${Math.round((aporteMensualUsd * supuestos.tipoCambioArs / ingresoMensualArs) * 100)}% del ingreso.`}
                </Text>
              </>
            )}
          </div>

          <div>
            <p className="eyebrow">Desde qué mes</p>
            <Select
              value={desde} onChange={setDesde} style={{ width: 170 }} aria-label="Desde qué mes proyectar"
              options={arranques.map(p => ({ value: p, label: fmtPeriodo(p) }))}
            />
            {desde !== hoy && (
              <Text type="secondary" className="resultado" style={{ display: 'block', marginTop: 6 }}>
                El plan arranca en {fmtPeriodo(desde)} con lo que tengas ahorrado hasta ahí. Entre
                hoy y ese mes no se supone nada: ni aportes ni rendimiento.
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
                    <td className="monto" style={{ color: Math.round(r.rendimiento) >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}>
                      {fmtNumConSigno(r.rendimiento)}
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

      <section>
        <h2>Mes a mes</h2>
        {/* La tercera vista del mismo calculo, y la unica donde el interes
            compuesto se ve pasar en vez de deducirse: "Rindio" arranca casi en
            cero y sube todos los meses sin que uno ponga un peso mas. */}
        <Space wrap style={{ marginBottom: 4 }}>
          <Select
            value={estrategiaTabla} onChange={setEstrategiaTabla} style={{ width: 190 }}
            aria-label="Qué estrategia ver mes a mes"
            options={ESTRATEGIAS.map(e => ({ value: e.id, label: e.nombre }))}
          />
        </Space>
        <p className="resultado">
          Desde {fmtPeriodo(desde)} hasta {fmtPeriodo(final.periodo)}, en dólares de hoy.{' '}
          <strong>Rindió</strong> es lo que puso el interés ese mes: con el mismo aporte todos los
          meses, sube solo.
        </p>
        <div className="tabla mes-a-mes">
          <table className="bimoneda">
            <thead>
              <tr><th>Mes</th><th>Pusiste</th><th>Rindió</th><th>Total</th></tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.periodo}>
                  <td>{fmtPeriodo(f.periodo)}</td>
                  <td className="monto">{fmtNumEntero(f.aportado)}</td>
                  {/* El mes 0 es el punto de partida: no rindio nada porque
                      todavia no paso un mes. Un 0 ahi se leeria como que ese
                      mes el interes no dio nada, que es otra cosa. */}
                  <td
                    className="monto"
                    style={{ color: Math.round(f.rindio) >= 0 ? 'var(--dolar)' : 'var(--alerta)' }}
                  >
                    {f.mes === 0 ? '—' : fmtNumConSigno(f.rindio)}
                  </td>
                  <td className="monto">{fmtNumEntero(f.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">
          {filas.length} {filas.length === 1 ? 'mes' : 'meses'}. El aporte del mes entra{' '}
          <strong>después</strong> de que rinda el saldo: el primer mes no rinde sobre plata que
          todavía no estaba.
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
