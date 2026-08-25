'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Typography } from 'antd';

const { Text } = Typography;

export default function MetaForm() {
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [moneda, setMoneda] = useState<'USD' | 'ARS'>('USD');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, montoObjetivo: monto, moneda, fechaObjetivo: fecha || null }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      setNombre(''); setMonto(null); setFecha('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          placeholder="Vacaciones, entrada del depto…"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <InputNumber
          placeholder="Monto"
          value={monto}
          onChange={setMonto}
          min={1}
          style={{ width: 140 }}
        />
        <Select
          value={moneda}
          onChange={setMoneda}
          style={{ width: 90 }}
          options={[{ value: 'USD', label: 'USD' }, { value: 'ARS', label: 'ARS' }]}
        />
        <Input
          placeholder="2027-12 (opcional)"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          style={{ width: 160 }}
        />
        <Button type="primary" onClick={crear} loading={guardando} disabled={!nombre.trim() || !monto}>
          Agregar meta
        </Button>
      </Space>
      {error && <Text type="danger" className="resultado">{error}</Text>}
      <Text type="secondary" className="resultado">
        En USD la meta no se licúa con la inflación. En ARS se convierte al tipo de cambio
        de los supuestos, así que el progreso se mueve cuando cambiás ese número.
      </Text>
    </Space>
  );
}
