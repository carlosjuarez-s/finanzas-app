'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Space, Typography } from 'antd';
import type { SyncResult } from '@/lib/sync';

const { Text } = Typography;

type Estado =
  | { fase: 'idle' }
  | { fase: 'corriendo' }
  | { fase: 'listo'; resultado: SyncResult }
  | { fase: 'error'; msg: string };

// "0 resumenes · 0 recibos" no dice si algo anduvo mal o si ya estaba todo al
// dia, que es el resultado esperado cuando se sincroniza dos veces seguidas.
function resumen({ statements, salaries, skipped }: SyncResult): string {
  const nuevos = [
    statements && `${statements} ${statements === 1 ? 'resumen' : 'resumenes'}`,
    salaries && `${salaries} ${salaries === 1 ? 'recibo' : 'recibos'}`,
  ].filter(Boolean).join(' · ');

  if (nuevos) return skipped ? `${nuevos} · ${skipped} ya estaban` : nuevos;
  return skipped ? `Todo al dia (${skipped} ya cargados)` : 'No hay PDFs nuevos.';
}

export default function SyncButton() {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' });
  const router = useRouter();

  async function sincronizar() {
    setEstado({ fase: 'corriendo' });
    try {
      const res = await fetch('/api/run-sync', { method: 'POST' });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      const resultado: SyncResult = cuerpo;
      setEstado({ fase: 'listo', resultado });
      router.refresh(); // el dashboard es un server component: recarga los datos
    } catch (e) {
      setEstado({ fase: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  }

  const corriendo = estado.fase === 'corriendo';

  return (
    <Space className="acciones" wrap align="center">
      {/* loading ya muestra el spinner y bloquea el boton: no hace falta
          alternar el texto ni manejar disabled a mano. */}
      <Button type="primary" onClick={sincronizar} loading={corriendo}>
        Sincronizar ahora
      </Button>

      {corriendo && (
        <Text type="secondary" className="resultado">
          Leyendo Drive y extrayendo PDFs, puede tardar un minuto.
        </Text>
      )}

      {estado.fase === 'error' && <Text type="danger" className="resultado">{estado.msg}</Text>}

      {estado.fase === 'listo' && (
        <Text
          type={estado.resultado.errors.length ? 'warning' : 'success'}
          className="resultado"
        >
          {resumen(estado.resultado)}
          {estado.resultado.errors.map((err, i) => <span key={i} style={{ display: 'block' }}>{err}</span>)}
        </Text>
      )}
    </Space>
  );
}
