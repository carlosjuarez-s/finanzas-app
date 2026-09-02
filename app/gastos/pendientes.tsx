'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Typography, Tag } from 'antd';
import { fmtArs } from '@/lib/formato';
import type { Pendiente } from '@/lib/pagos';

const { Text } = Typography;

export default function Pendientes({ pendientes, pagados, faltaPagarArs }: {
  pendientes: Pendiente[]; pagados: number; faltaPagarArs: number | null;
}) {
  if (!pendientes.length && !pagados) return null;

  return (
    <section>
      <h2>
        Falta pagar
        {faltaPagarArs !== null && pendientes.length > 0 && (
          <span className="chip">{fmtArs(faltaPagarArs)}</span>
        )}
      </h2>

      {!pendientes.length ? (
        <p className="resultado">
          Está todo pagado este mes: {pagados} {pagados === 1 ? 'ítem' : 'ítems'}.
        </p>
      ) : (
        <>
          {faltaPagarArs === null && (
            <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
              Hay pendientes en dólares y falta el tipo de cambio del mes, así que no se puede
              dar un total. Los montos de abajo están cada uno en su moneda.
            </p>
          )}
          {pendientes.map(p => <Fila key={`${p.tipo}-${p.id}`} item={p} />)}
          {/* Deberla y haberla pagado son estados distintos de tu caja, pero el
              gasto del mes es el mismo: aclararlo evita que alguien crea que
              posponer un pago le mejora el ahorro. */}
          <p className="nota">
            Marcar algo como pagado no cambia el gasto del mes: el gasto ya está imputado
            acá lo hayas pagado o no. Lo que cambia es tu caja.
          </p>
        </>
      )}
    </section>
  );
}

function Fila({ item }: { item: Pendiente }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function marcar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/pagos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: item.tipo, id: item.id, pagado: true }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOcupado(false);
    }
  }

  return (
    <div className="fila fila-pago">
      <span className="pago-que">
        {item.concepto}
        {item.tipo === 'tarjeta' && <Tag style={{ marginLeft: 6 }}>resumen</Tag>}
        {error && <Text type="danger" className="resultado" style={{ display: 'block' }}>{error}</Text>}
      </span>
      <span className="pago-cuanto">
        <span className="monto ars">
          {item.montoArs > 0 && fmtArs(item.montoArs)}
          {item.montoUsd > 0 && (item.montoArs > 0 ? ` + U$S ${item.montoUsd.toLocaleString('es-AR')}` : `U$S ${item.montoUsd.toLocaleString('es-AR')}`)}
        </span>
        <Button size="small" onClick={marcar} loading={ocupado}>
          Pagado
        </Button>
      </span>
    </div>
  );
}
