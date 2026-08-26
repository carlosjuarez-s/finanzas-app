'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Typography } from 'antd';

const { Text } = Typography;

const CLASES = ['CRIPTO', 'CEDEAR', 'RENTA_FIJA', 'FCI', 'DOLAR'].map(v => ({ value: v, label: v }));

export default function AltaTransaccion() {
  const [f, setF] = useState({
    activo: '', clase: 'CRIPTO', tipo: 'COMPRA', fecha: new Date().toISOString().slice(0, 10),
    cantidad: null as number | null, precioUnitario: null as number | null,
    moneda: 'USD', tipoCambioDia: null as number | null, comision: null as number | null,
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(s => ({ ...s, [k]: v }));

  async function guardar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/transacciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      setF(s => ({ ...s, activo: '', cantidad: null, precioUnitario: null, comision: null }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section>
      <h2>Anotar una operación</h2>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          <Input placeholder="Activo (BTC, AAPL)" value={f.activo}
            onChange={e => set('activo', e.target.value.toUpperCase())} style={{ width: 150 }} />
          <Select value={f.clase} onChange={v => set('clase', v)} options={CLASES} style={{ width: 130 }} />
          <Select value={f.tipo} onChange={v => set('tipo', v)} style={{ width: 120 }}
            options={[{ value: 'COMPRA', label: 'Compra' }, { value: 'VENTA', label: 'Venta' }]} />
          <Input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} style={{ width: 150 }} />
        </Space>
        <Space wrap>
          <InputNumber placeholder="Cantidad" value={f.cantidad} onChange={v => set('cantidad', v)} min={0} style={{ width: 140 }} />
          <InputNumber placeholder="Precio unitario" value={f.precioUnitario} onChange={v => set('precioUnitario', v)} min={0} style={{ width: 160 }} />
          <Select value={f.moneda} onChange={v => set('moneda', v)} style={{ width: 90 }}
            options={[{ value: 'USD', label: 'USD' }, { value: 'ARS', label: 'ARS' }]} />
          <InputNumber placeholder="Comisión" value={f.comision} onChange={v => set('comision', v)} min={0} style={{ width: 130 }} />
        </Space>

        {/* En pesos el tipo de cambio del dia es obligatorio: sin el, la ganancia
            en dolares no se puede calcular y el numero seria una ilusion. */}
        {f.moneda === 'ARS' && (
          <Space wrap>
            <InputNumber placeholder="Dólar ese día" value={f.tipoCambioDia}
              onChange={v => set('tipoCambioDia', v)} min={0.0001} style={{ width: 170 }} suffix="ARS/USD" />
            <Text type="secondary" className="resultado">
              Va el dólar del día de la operación, no el de hoy: si no, se borra justo el
              efecto que queremos medir.
            </Text>
          </Space>
        )}

        <Space wrap>
          <Button type="primary" onClick={guardar} loading={ocupado}
            disabled={!f.activo.trim() || !f.cantidad || f.precioUnitario === null}>
            Guardar operación
          </Button>
          {error && <Text type="danger" className="resultado">{error}</Text>}
        </Space>
      </Space>
    </section>
  );
}
