'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Popconfirm, Typography, Tag } from 'antd';

const { Text } = Typography;

export type Item = {
  id: string;
  entidad: 'gasto' | 'consumo';
  descripcion: string;
  categoria: string | null;
  monto: number;
  /** La parte en dolares, si la hay. Un gasto puede venir entero en USD:
   *  mostrando solo la parte en pesos figuraba como $ 0. */
  montoUsd?: number;
  origen?: string | null;
  corregido: boolean;
};


// Las categorias llegan como prop desde el server: son del usuario, no una
// lista fija que el cliente pueda conocer sola.
export default function Editor({ item, categorias, periodo, esFijo }: {
  item: Item;
  categorias: string[];
  /** El mes de la fila. Es desde cuándo empieza a valer si se marca como fijo. */
  periodo?: string;
  /** Si ya existe un fijo con este concepto. */
  esFijo?: boolean;
}) {
  const OPCIONES = categorias.map(c => ({ value: c, label: c }));
  const [editando, setEditando] = useState(false);
  const [descripcion, setDescripcion] = useState(item.descripcion);
  const [categoria, setCategoria] = useState(item.categoria ?? 'Otros');
  const [monto, setMonto] = useState<number | null>(item.monto);
  const [montoUsd, setMontoUsd] = useState<number | null>(item.montoUsd ?? 0);
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
      item.entidad === 'gasto'
        ? { entidad: 'gasto', id: item.id, concepto: descripcion, categoria, montoArs: monto, montoUsd }
        : { entidad: 'consumo', id: item.id, comercio: descripcion, categoria, montoArs: monto, montoUsd },
    ),
  });

  const borrar = () => pedir(
    { method: 'DELETE' },
    `/api/rectificar?entidad=gasto&id=${encodeURIComponent(item.id)}`,
  );

  // Marcar la fila como gasto fijo sin volver a escribirla. Los defaults son
  // los mas comunes —mensual, desde este mes, sin aumento— y el aumento se
  // agrega despues, que es lo unico que esta fila no sabe.
  const marcarFijo = () => pedir({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      concepto: item.descripcion,
      categoria: item.categoria ?? 'Otros',
      montoArs: item.monto,
      montoUsd: item.montoUsd ?? 0,
      periodo,
    }),
  }, '/api/recurrentes');

  if (!editando) {
    return (
      <div className="fila">
        <span>
          {item.descripcion}
          {item.categoria && <span className="chip">{item.categoria}</span>}
          {item.origen && <span className="chip">{item.origen.toLowerCase()}</span>}
          {/* Un dato corregido a mano vale mas que uno interpretado: que se vea. */}
          {item.corregido && <Tag color="green" style={{ marginLeft: 6 }}>corregido</Tag>}
          {esFijo && <Tag color="purple" style={{ marginLeft: 6 }}>fijo</Tag>}
        </span>
        <Space size="small" wrap>
          {/* Un gasto puede venir entero en dolares: mostrar solo los pesos lo
              dejaba en $ 0 aunque el cierre lo estuviera contando. */}
          {(item.monto > 0 || !item.montoUsd) && (
            <span className="monto ars">$ {item.monto.toLocaleString('es-AR')}</span>
          )}
          {!!item.montoUsd && (
            <span className="monto usd">U$S {item.montoUsd.toLocaleString('es-AR')}</span>
          )}
          {/* Solo cuando se sabe de que mes es la fila: sin eso no hay desde
              cuando empieza a valer el fijo. */}
          {periodo && !esFijo && (
            <Popconfirm
              title={`¿Marcar «${item.descripcion}» como gasto fijo?`}
              description="Queda mensual desde este mes, sin aumento. El aumento se agrega después."
              onConfirm={marcarFijo}
              okText="Sí, es fijo" cancelText="No"
            >
              <Button size="small" loading={ocupado}>Es fijo</Button>
            </Popconfirm>
          )}
          <Button size="small" onClick={() => setEditando(true)}>Corregir</Button>
        </Space>
        {error && <Text type="danger" className="resultado" style={{ display: 'block' }}>{error}</Text>}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px dotted var(--linea)' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          <Input value={descripcion} onChange={e => setDescripcion(e.target.value)} style={{ minWidth: 200 }} />
          <Select value={categoria} onChange={setCategoria} options={OPCIONES} style={{ width: 200 }} />
          <InputNumber value={monto} onChange={setMonto} min={0} style={{ width: 150 }} prefix="$" aria-label="Monto en pesos" />
          <InputNumber value={montoUsd} onChange={setMontoUsd} min={0} style={{ width: 150 }} prefix="U$S" aria-label="Monto en dólares" />
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
