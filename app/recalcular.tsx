'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Typography } from 'antd';

const { Text } = Typography;

// Rehacer los cierres de todos los meses. Hace falta cuando los datos entraron
// por afuera de la app —un import— y no hubo nada que disparara el recalculo.
export default function Recalcular() {
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function correr() {
    setOcupado(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch('/api/recalcular', { method: 'POST' });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      const n = Number(cuerpo?.periodos ?? 0);
      setResultado(`${n} ${n === 1 ? 'mes recalculado' : 'meses recalculados'}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="acciones">
      <Button onClick={correr} loading={ocupado}>Recalcular todos los meses</Button>
      {resultado && <Text type="success" className="resultado">{resultado}</Text>}
      {error && <Text type="danger" className="resultado">{error}</Text>}
    </div>
  );
}
