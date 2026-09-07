'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Typography, Tag, Popconfirm } from 'antd';
import { fmtArs, fmtUsd, fmtPeriodo } from '@/lib/formato';
import { caeEn, montoEn, proximoAjuste, type Recurrente, type Indice } from '@/lib/recurrentes';

const { Text } = Typography;

// Las periodicidades que existen de verdad. Un campo libre invita a poner 4 o
// 5, que no corresponde a ningun contrato y confunde despues.
const CADA = [
  { value: 1, label: 'Todos los meses' },
  { value: 2, label: 'Cada 2 meses' },
  { value: 3, label: 'Cada 3 meses' },
  { value: 6, label: 'Cada 6 meses' },
  { value: 12, label: 'Una vez al año' },
];

const AJUSTE = [
  { value: 0, label: 'No aumenta' },
  { value: 3, label: 'Ajusta cada 3 meses' },
  { value: 6, label: 'Ajusta cada 6 meses' },
  { value: 12, label: 'Ajusta cada 12 meses' },
];

/**
 * Los gastos fijos declarados.
 *
 * La estimacion los adivinaba mirando el historico. Declarados, tres cosas que
 * antes se inferian mal pasan a ser datos: cuando aumenta, cada cuanto cae, y
 * hasta cuando.
 */
export default function Fijos({ fijos, periodo, categorias, indices }: {
  fijos: Recurrente[];
  periodo: string;
  categorias: string[];
  indices: Record<string, Indice>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({
    concepto: '', categoria: categorias[0] ?? 'Otros',
    montoArs: null as number | null, montoUsd: null as number | null,
    cadaMeses: 1, primerPeriodo: periodo, hastaPeriodo: '',
    aumentoCadaMeses: 0, aumentoPct: null as number | null, indice: '',
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const nombresDeIndices = Object.keys(indices);

  async function pedir(init: RequestInit, url = '/api/recurrentes') {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      setAbierto(false);
      setF(s => ({ ...s, concepto: '', montoArs: null, montoUsd: null }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = () => pedir({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...f,
      hastaPeriodo: f.hastaPeriodo || null,
      aumentoCadaMeses: f.aumentoCadaMeses || null,
      aumentoPct: f.indice ? null : f.aumentoPct,
      indice: f.indice || null,
    }),
  });

  const delMes = fijos.filter(r => caeEn(r, periodo));
  const totalArs = delMes.reduce((s, r) => s + montoEn(r, periodo, r.indice ? indices[r.indice] : undefined).monto.ars, 0);

  return (
    <section>
      <h2>
        Gastos fijos
        {totalArs > 0 && <span className="chip">{fmtArs(totalArs)} este mes</span>}
      </h2>

      {fijos.length === 0 && !abierto && (
        <p className="resultado">
          El alquiler, el seguro, el gimnasio. Declarados acá, la estimación del mes que
          viene deja de adivinarlos: sabe cuánto son, cada cuánto caen y cuándo aumentan.
        </p>
      )}

      {fijos.map(r => {
        const cae = caeEn(r, periodo);
        const m = montoEn(r, periodo, r.indice ? indices[r.indice] : undefined);
        const proximo = proximoAjuste(r, periodo);
        return (
          <div className="fila" key={r.id}>
            <span>
              {r.concepto}
              <span className="chip">{r.categoria}</span>
              {r.cadaMeses > 1 && <span className="chip">cada {r.cadaMeses} meses</span>}
              {/* Que no caiga este mes no es un error: un seguro semestral cae
                  dos veces al año y el resto del tiempo no esta. */}
              {!cae && <Tag style={{ marginLeft: 6 }}>no cae en {fmtPeriodo(periodo)}</Tag>}
              {r.hastaPeriodo && <Tag style={{ marginLeft: 6 }}>hasta {fmtPeriodo(r.hastaPeriodo)}</Tag>}
              <span className="resultado" style={{ display: 'block' }}>
                {r.indice
                  ? `Ajusta por ${r.indice} cada ${r.aumentoCadaMeses} ${r.aumentoCadaMeses === 1 ? 'mes' : 'meses'}`
                  : r.aumentoPct
                    ? `${r.aumentoPct > 0 ? '+' : ''}${r.aumentoPct}% cada ${r.aumentoCadaMeses} meses`
                    : 'Sin aumento'}
                {m.ajustes > 0 && ` · ${m.ajustes} ${m.ajustes === 1 ? 'ajuste aplicado' : 'ajustes aplicados'}`}
                {proximo && ` · próximo en ${fmtPeriodo(proximo)}`}
                {m.faltaIndice && ' · falta la variación de algún mes del índice'}
              </span>
            </span>
            <Space size="small" wrap>
              {/* Un mes en que no cae vale cero ESTE mes, y mostrar el monto al
                  lado de "no cae" se contradice: parecia que se estaba
                  contando. El monto se dice igual, pero como referencia. */}
              {!cae ? (
                <span className="monto" title="Cuánto es cuando cae">
                  — <span className="resultado" style={{ fontSize: 12 }}>
                    ({m.monto.ars > 0 ? fmtArs(m.monto.ars) : fmtUsd(m.monto.usd)} cuando cae)
                  </span>
                </span>
              ) : (
                <>
                  {m.monto.ars > 0 && <span className="monto ars">{fmtArs(m.monto.ars)}</span>}
                  {m.monto.usd > 0 && <span className="monto usd">{fmtUsd(m.monto.usd)}</span>}
                </>
              )}
              <Popconfirm
                title="¿Borrar este gasto fijo?"
                onConfirm={() => pedir({ method: 'DELETE' }, `/api/recurrentes?id=${encodeURIComponent(r.id)}`)}
                okText="Borrar" cancelText="No"
              >
                <Button size="small" danger>Borrar</Button>
              </Popconfirm>
            </Space>
          </div>
        );
      })}

      {!abierto ? (
        <div className="acciones">
          <Button onClick={() => setAbierto(true)}>Agregar un gasto fijo</Button>
        </div>
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 10 }}>
          <Space wrap>
            <Input
              value={f.concepto} onChange={e => setF(s => ({ ...s, concepto: e.target.value }))}
              placeholder="Qué es: «alquiler»" style={{ minWidth: 200 }} aria-label="Qué es"
            />
            <Select
              value={f.categoria} onChange={v => setF(s => ({ ...s, categoria: v }))}
              options={categorias.map(c => ({ value: c, label: c }))}
              style={{ width: 200 }} aria-label="Categoría"
            />
          </Space>
          <Space wrap>
            <InputNumber
              value={f.montoArs} onChange={v => setF(s => ({ ...s, montoArs: v }))} min={0}
              style={{ width: 160 }} prefix="$" placeholder="En pesos" aria-label="Monto en pesos"
            />
            <InputNumber
              value={f.montoUsd} onChange={v => setF(s => ({ ...s, montoUsd: v }))} min={0}
              style={{ width: 160 }} prefix="U$S" placeholder="En dólares" aria-label="Monto en dólares"
            />
            <Select
              value={f.cadaMeses} onChange={v => setF(s => ({ ...s, cadaMeses: v }))}
              options={CADA} style={{ width: 180 }} aria-label="Cada cuánto"
            />
          </Space>
          <Space wrap>
            <Input
              type="month" value={f.primerPeriodo}
              onChange={e => setF(s => ({ ...s, primerPeriodo: e.target.value }))}
              style={{ width: 170 }} aria-label="Desde qué mes"
            />
            <Input
              type="month" value={f.hastaPeriodo}
              onChange={e => setF(s => ({ ...s, hastaPeriodo: e.target.value }))}
              style={{ width: 170 }} aria-label="Hasta qué mes, opcional"
            />
            <Text type="secondary" className="resultado">Desde / hasta (el hasta es opcional)</Text>
          </Space>

          <Space wrap>
            <Select
              value={f.aumentoCadaMeses} onChange={v => setF(s => ({ ...s, aumentoCadaMeses: v }))}
              options={AJUSTE} style={{ width: 200 }} aria-label="Cada cuánto aumenta"
            />
            {f.aumentoCadaMeses > 0 && (
              <>
                <InputNumber
                  value={f.aumentoPct} onChange={v => setF(s => ({ ...s, aumentoPct: v }))}
                  suffix="%" style={{ width: 130 }} placeholder="Cuánto"
                  disabled={!!f.indice} aria-label="Porcentaje de aumento"
                />
                {nombresDeIndices.length > 0 && (
                  <Select
                    value={f.indice} onChange={v => setF(s => ({ ...s, indice: v }))}
                    style={{ width: 190 }} aria-label="O atado a un índice"
                    options={[{ value: '', label: 'o un % fijo' }, ...nombresDeIndices.map(n => ({ value: n, label: `Ajusta por ${n}` }))]}
                  />
                )}
              </>
            )}
          </Space>

          <Space wrap>
            <Button type="primary" onClick={guardar} loading={ocupado}>Guardar</Button>
            <Button onClick={() => setAbierto(false)}>Cancelar</Button>
          </Space>
          {/* Dos cosas que no son obvias y cambian el numero. */}
          <p className="nota">
            El primer aumento cae después del primer mes, no en él: el mes en que empezás a
            pagar algo pagás el precio de entrada. Y los aumentos se componen — dos del 10%
            son 21%, no 20%.
          </p>
          {error && <Text type="danger" className="resultado">{error}</Text>}
        </Space>
      )}
    </section>
  );
}
