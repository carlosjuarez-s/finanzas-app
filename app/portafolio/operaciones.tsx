'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Popconfirm, Typography, Tag } from 'antd';

const { Text } = Typography;

export type Operacion = {
  id: string;
  activo: string;
  tipo: string;
  fecha: string;
  cantidad: number;
  precioUnitario: number;
  moneda: string;
  tipoCambioDia: number | null;
  comision: number;
  origen: string;
};

export default function Operaciones({ operaciones }: { operaciones: Operacion[] }) {
  const [editando, setEditando] = useState<string | null>(null);

  if (!operaciones.length) return null;

  // Las importadas de un CSV no traen el dolar del dia, y sin eso una operacion
  // en pesos no se puede medir en dolares. Van primero: es lo que hay que
  // completar para que el resultado sea real.
  const incompletas = operaciones.filter(o => o.moneda === 'ARS' && !o.tipoCambioDia);
  const resto = operaciones.filter(o => !(o.moneda === 'ARS' && !o.tipoCambioDia));

  return (
    <section>
      <h2>Operaciones cargadas <span className="chip">{operaciones.length}</span></h2>

      {incompletas.length > 0 && (
        <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
          {incompletas.length} {incompletas.length === 1 ? 'operación en pesos no tiene' : 'operaciones en pesos no tienen'} el
          dólar de su día. Sin ese dato no entran en el cálculo de ganancia: completalo abajo.
        </p>
      )}

      {[...incompletas, ...resto].map(o => (
        <Fila
          key={o.id}
          op={o}
          abierta={editando === o.id}
          abrir={() => setEditando(o.id)}
          cerrar={() => setEditando(null)}
        />
      ))}
    </section>
  );
}

function Fila({ op, abierta, abrir, cerrar }: {
  op: Operacion; abierta: boolean; abrir: () => void; cerrar: () => void;
}) {
  const [f, setF] = useState({
    cantidad: op.cantidad as number | null,
    precioUnitario: op.precioUnitario as number | null,
    fecha: op.fecha,
    moneda: op.moneda,
    tipoCambioDia: op.tipoCambioDia,
    comision: op.comision as number | null,
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const faltaTc = op.moneda === 'ARS' && !op.tipoCambioDia;

  async function pedir(init: RequestInit, url = '/api/transacciones') {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      cerrar();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = () => pedir({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: op.id, ...f }),
  });

  const borrar = () => pedir({ method: 'DELETE' }, `/api/transacciones?id=${encodeURIComponent(op.id)}`);

  if (!abierta) {
    return (
      <div className="fila">
        <span>
          <strong>{op.activo}</strong>
          <span className="chip">{op.tipo.toLowerCase()}</span>
          <span className="chip">{op.origen.toLowerCase()}</span>
          {faltaTc && <Tag color="orange" style={{ marginLeft: 6 }}>falta el dólar</Tag>}
          <span className="resultado" style={{ display: 'block' }}>
            {op.fecha} · {op.cantidad} × {op.moneda} {op.precioUnitario.toLocaleString('es-AR')}
          </span>
        </span>
        <Button size="small" onClick={abrir}>Editar</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px dotted var(--linea)' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Text strong>{op.activo} · {op.tipo.toLowerCase()}</Text>
        <Space wrap>
          <Input type="date" value={f.fecha} onChange={e => setF(s => ({ ...s, fecha: e.target.value }))} style={{ width: 150 }} />
          <InputNumber placeholder="Cantidad" value={f.cantidad} onChange={v => setF(s => ({ ...s, cantidad: v }))} min={0} style={{ width: 140 }} />
          <InputNumber placeholder="Precio de entrada" value={f.precioUnitario} onChange={v => setF(s => ({ ...s, precioUnitario: v }))} min={0} style={{ width: 170 }} />
          <Select value={f.moneda} onChange={v => setF(s => ({ ...s, moneda: v }))} style={{ width: 90 }}
            options={[{ value: 'USD', label: 'USD' }, { value: 'ARS', label: 'ARS' }]} />
          <InputNumber placeholder="Comisión" value={f.comision} onChange={v => setF(s => ({ ...s, comision: v }))} min={0} style={{ width: 130 }} />
        </Space>

        {f.moneda === 'ARS' && (
          <Space wrap>
            <InputNumber placeholder="Dólar ese día" value={f.tipoCambioDia}
              onChange={v => setF(s => ({ ...s, tipoCambioDia: v }))} min={0.0001} style={{ width: 170 }} suffix="ARS/USD" />
            <Text type="secondary" className="resultado">
              El del día de la operación, no el de hoy.
            </Text>
          </Space>
        )}

        <Space wrap>
          <Button type="primary" size="small" onClick={guardar} loading={ocupado}>Guardar</Button>
          <Button size="small" onClick={cerrar}>Cancelar</Button>
          <Popconfirm title={`¿Borrar esta operación de ${op.activo}?`} onConfirm={borrar} okText="Borrar" cancelText="No">
            <Button size="small" danger>Borrar</Button>
          </Popconfirm>
        </Space>
        {error && <Text type="danger" className="resultado">{error}</Text>}
      </Space>
    </div>
  );
}
