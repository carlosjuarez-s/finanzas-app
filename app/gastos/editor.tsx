'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Popconfirm, Typography, Tag } from 'antd';
import { CATEGORIAS } from '@/lib/prompts';

const { Text } = Typography;

export type Item = {
  id: string;
  entidad: 'gasto' | 'consumo' | 'sueldo';
  descripcion: string;
  categoria: string | null;
  monto: number;
  origen?: string | null;
  corregido: boolean;
};

const OPCIONES = CATEGORIAS.map(c => ({ value: c, label: c }));

export default function Editor({ item }: { item: Item }) {
  const [editando, setEditando] = useState(false);
  const [descripcion, setDescripcion] = useState(item.descripcion);
  const [categoria, setCategoria] = useState(item.categoria ?? 'Otros');
  const [monto, setMonto] = useState<number | null>(item.monto);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function pedir(init: RequestInit, url = '/api/rectificar') {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      setEditando(false);
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
    body: JSON.stringify(
      item.entidad === 'sueldo'
        ? { entidad: 'sueldo', id: item.id, netoArs: monto }
        : item.entidad === 'gasto'
          ? { entidad: 'gasto', id: item.id, concepto: descripcion, categoria, montoArs: monto }
          : { entidad: 'consumo', id: item.id, comercio: descripcion, categoria, montoArs: monto },
    ),
  });

  const borrar = () => pedir(
    { method: 'DELETE' },
    `/api/rectificar?entidad=gasto&id=${encodeURIComponent(item.id)}`,
  );

  if (!editando) {
    return (
      <div className="fila">
        <span>
          {item.descripcion}
          {item.categoria && <span className="chip">{item.categoria}</span>}
          {item.origen && <span className="chip">{item.origen.toLowerCase()}</span>}
          {/* Un dato corregido a mano vale mas que uno interpretado: que se vea. */}
          {item.corregido && <Tag color="green" style={{ marginLeft: 6 }}>corregido</Tag>}
        </span>
        <Space size="small">
          <span className="monto ars">$ {item.monto.toLocaleString('es-AR')}</span>
          <Button size="small" onClick={() => setEditando(true)}>Corregir</Button>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px dotted var(--linea)' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          {item.entidad !== 'sueldo' && (
            <>
              <Input value={descripcion} onChange={e => setDescripcion(e.target.value)} style={{ minWidth: 200 }} />
              <Select value={categoria} onChange={setCategoria} options={OPCIONES} style={{ width: 200 }} />
            </>
          )}
          <InputNumber value={monto} onChange={setMonto} min={0} style={{ width: 160 }} prefix="$" />
        </Space>
        <Space wrap>
          <Button type="primary" size="small" onClick={guardar} loading={ocupado}>Guardar</Button>
          <Button size="small" onClick={() => setEditando(false)}>Cancelar</Button>
          {item.entidad === 'gasto' && (
            <Popconfirm title="¿Borrar este gasto?" onConfirm={borrar} okText="Borrar" cancelText="No">
              <Button size="small" danger>Borrar</Button>
            </Popconfirm>
          )}
        </Space>
        {error && <Text type="danger" className="resultado">{error}</Text>}
      </Space>
    </div>
  );
}
