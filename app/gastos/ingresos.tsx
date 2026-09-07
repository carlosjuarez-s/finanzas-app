'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Typography, Tag, Popconfirm } from 'antd';
import { fmtArs, fmtUsd, fmtPeriodo } from '@/lib/formato';
import { TIPOS, ETIQUETA, type Tipo } from '@/lib/ingresos';

const { Text } = Typography;

export type Fila = {
  id: string; concepto: string; tipo: Tipo; montoArs: number; montoUsd: number; notas: string | null;
};

// El color dice de que tipo es sin leer: verde-dolar para lo que rindio, tinta
// suave para lo que solo volvio. Pero el tipo va escrito igual — el color
// refuerza, no informa solo.
const COLOR: Record<Tipo, string | undefined> = {
  GANANCIA: 'green', REINTEGRO: undefined, EXTRA: 'blue',
};
const CORTO: Record<Tipo, string> = {
  GANANCIA: 'ganancia', REINTEGRO: 'reintegro', EXTRA: 'extra',
};

/**
 * Plata que entro y no es sueldo.
 *
 * Vive en la pagina del mes, al lado del sueldo, porque es lo mismo mirado del
 * otro lado: la respuesta a "¿cuanto entro?" no es solo el recibo.
 */
export default function Ingresos({ periodo, filas }: { periodo: string; filas: Fila[] }) {
  const [abierto, setAbierto] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [tipo, setTipo] = useState<Tipo>('GANANCIA');
  const [ars, setArs] = useState<number | null>(null);
  const [usd, setUsd] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const totalArs = filas.reduce((s, f) => s + f.montoArs, 0);
  const totalUsd = filas.reduce((s, f) => s + f.montoUsd, 0);

  async function pedir(init: RequestInit, url = '/api/ingresos') {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      setAbierto(false);
      setConcepto(''); setArs(null); setUsd(null);
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
    body: JSON.stringify({ periodo, concepto, tipo, montoArs: ars ?? 0, montoUsd: usd ?? 0 }),
  });

  return (
    <section>
      <h2>
        Entró y no es sueldo
        {totalArs > 0 && <span className="chip">{fmtArs(totalArs)}</span>}
        {totalUsd > 0 && <span className="chip">{fmtUsd(totalUsd)}</span>}
      </h2>

      {filas.length === 0 && !abierto && (
        <p className="resultado">
          Si una inversión te dio ganancia, o alguien te devolvió plata, cargalo acá:
          suma al ingreso de {fmtPeriodo(periodo)} y mejora la tasa de ahorro del mes, que
          si no queda peor de lo que fue.
        </p>
      )}

      {filas.map(f => (
        <div className="fila" key={f.id}>
          <span>
            {f.concepto}
            <Tag color={COLOR[f.tipo]} style={{ marginLeft: 6 }}>{CORTO[f.tipo]}</Tag>
          </span>
          <Space size="small" wrap>
            {f.montoArs > 0 && <span className="monto ars">{fmtArs(f.montoArs)}</span>}
            {f.montoUsd > 0 && <span className="monto usd">{fmtUsd(f.montoUsd)}</span>}
            <Popconfirm
              title="¿Borrar este ingreso?"
              onConfirm={() => pedir({ method: 'DELETE' }, `/api/ingresos?id=${encodeURIComponent(f.id)}`)}
              okText="Borrar" cancelText="No"
            >
              <Button size="small" danger>Borrar</Button>
            </Popconfirm>
          </Space>
        </div>
      ))}

      {!abierto ? (
        <div className="acciones">
          <Button onClick={() => setAbierto(true)}>Cargar un ingreso</Button>
        </div>
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 10 }}>
          <Space wrap>
            <Input
              value={concepto} onChange={e => setConcepto(e.target.value)}
              placeholder="De qué es: «venta de USDT»" style={{ minWidth: 230 }}
              aria-label="De qué es"
            />
            <Select
              value={tipo} onChange={setTipo} style={{ width: 230 }} aria-label="Tipo"
              options={TIPOS.map(t => ({ value: t, label: ETIQUETA[t] }))}
            />
          </Space>
          <Space wrap>
            <InputNumber
              value={ars} onChange={setArs} min={0} style={{ width: 170 }}
              prefix="$" placeholder="En pesos" aria-label="Monto en pesos"
            />
            <InputNumber
              value={usd} onChange={setUsd} min={0} style={{ width: 170 }}
              prefix="U$S" placeholder="En dólares" aria-label="Monto en dólares"
            />
          </Space>
          <Space wrap>
            <Button type="primary" onClick={guardar} loading={ocupado}>Guardar</Button>
            <Button onClick={() => setAbierto(false)}>Cancelar</Button>
          </Space>
          {/* La distincion no es cosmetica: mezclarlas hace parecer que la
              inversion rindio el doble de lo que rindio. */}
          <p className="nota">
            «Ganancia» es plata nueva: la inversión rindió. «Me devolvieron» es la misma
            plata volviendo — suma igual al mes, pero no cuenta como rendimiento.
          </p>
          {error && <Text type="danger" className="resultado">{error}</Text>}
        </Space>
      )}
    </section>
  );
}
