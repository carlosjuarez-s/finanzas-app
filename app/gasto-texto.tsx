'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Space, Typography, Tag } from 'antd';

const { Text } = Typography;

type Respuesta = {
  estado?: 'cargado' | 'desconocido';
  gasto?: { concepto: string; categoria: string; periodo: string; montoArs: number };
  detalle?: string;
  hallazgos?: string[];
  historico?: string;
};

export default function GastoTexto() {
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function interpretar() {
    setEnviando(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch('/api/gasto-texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion }),
      });
      const cuerpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${r.status}`);
      setRes(cuerpo);
      if (cuerpo.estado === 'cargado') {
        setDescripcion('');
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2>Anotar un gasto escribiendo</h2>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Text type="secondary" className="resultado">
          Para lo que no tiene comprobante. Ejemplo: «pagué 85 lucas de alquiler en septiembre»
          o «12.500 de gas, vence el 20».
        </Text>

        <Input.TextArea
          rows={2}
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Describí el gasto…"
          maxLength={2000}
        />

        <Space wrap align="center">
          <Button type="primary" onClick={interpretar} loading={enviando} disabled={descripcion.trim().length < 4}>
            Interpretar y guardar
          </Button>
          {error && <Text type="danger" className="resultado">{error}</Text>}
        </Space>

        {res?.estado === 'cargado' && res.gasto && (
          <Text type="success" className="resultado">
            Guardado: {res.gasto.concepto} · {res.gasto.periodo} ·{' '}
            $ {res.gasto.montoArs.toLocaleString('es-AR')}
            <Tag style={{ marginLeft: 8 }}>{res.gasto.categoria}</Tag>
          </Text>
        )}

        {res?.estado === 'desconocido' && (
          <Text type="warning" className="resultado">{res.detalle}</Text>
        )}

        {res?.historico && <Text type="warning" className="resultado">{res.historico}</Text>}

        {/* Que se vea que la redaccion actuo: si no, es una promesa invisible. */}
        {res?.hallazgos?.length ? (
          <Text type="secondary" className="resultado">
            Se censuró antes de enviar: {res.hallazgos.join(', ')}.
          </Text>
        ) : null}
      </Space>
    </section>
  );
}
