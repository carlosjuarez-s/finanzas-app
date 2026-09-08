'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InputNumber, Select, Space, Typography, Tag } from 'antd';
import { mezcla, type Sueldo } from '@/lib/sueldo';
import { fmtArs, fmtUsd, fmtPct, fmtPeriodo, agruparMiles, desagruparMiles } from '@/lib/formato';

const { Text } = Typography;

// El sueldo del mes, cargado a mano y en las dos monedas.
//
// El recibo no alcanza: la parte en dolares se cobra por fuera y ningun PDF
// argentino la trae. Sin el neto completo no hay tasa de ahorro ni estimacion
// del mes que viene, asi que esto tiene que poder cargarse sin un documento.

export default function SueldoManual({ periodo, anterior, actual, tipoCambio }: {
  periodo: string;
  anterior: string;
  actual: { periodo: string; netoArs: number; netoUsd: number; corregido: boolean } | null;
  tipoCambio: number | null;
}) {
  const [editando, setEditando] = useState(false);
  // Los dos meses que el cierre mira: el del mes y el del anterior, porque el
  // sueldo de un mes paga la tarjeta del siguiente. No hay campo libre de
  // fecha: cargar el sueldo en un mes que este cierre no lee seria escribir un
  // dato que despues no aparece en ningun lado.
  const [mes, setMes] = useState(actual?.periodo ?? periodo);
  const [ars, setArs] = useState<number | null>(actual?.netoArs ?? null);
  const [usd, setUsd] = useState<number | null>(actual?.netoUsd ?? null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // La mezcla se recalcula mientras se escribe: configurar un 70/30 sin ver el
  // porcentaje es cargar dos numeros a ciegas.
  const enVivo = mezcla({ periodo: mes, netoArs: ars ?? 0, netoUsd: usd ?? 0 }, tipoCambio);

  async function guardar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/sueldo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: mes, netoArs: ars ?? 0, netoUsd: usd ?? 0 } satisfies Sueldo),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const OPCIONES = [
    { value: anterior, label: `Sueldo de ${fmtPeriodo(anterior)}` },
    { value: periodo, label: `Sueldo de ${fmtPeriodo(periodo)}` },
  ];

  return (
    <section>
      <h2>
        Sueldo que paga este cierre
        {actual?.corregido && <Tag color="green" style={{ marginLeft: 8 }}>a mano</Tag>}
      </h2>

      {!editando ? (
        <>
          {actual ? (
            <>
              <div className="fila fila-sueldo">
                <span>Neto de {fmtPeriodo(actual.periodo)}</span>
                <Space size="small" wrap>
                  <span className="monto ars">{fmtArs(actual.netoArs)}</span>
                  {actual.netoUsd > 0 && <span className="monto usd">{fmtUsd(actual.netoUsd)}</span>}
                  <Button size="small" onClick={() => setEditando(true)}>Corregir</Button>
                </Space>
              </div>
              <Reparto {...mezcla(actual, tipoCambio)} />
            </>
          ) : (
            <>
              <p className="resultado">
                No hay sueldo cargado para {fmtPeriodo(anterior)} ni {fmtPeriodo(periodo)}. Sin el
                neto, el cierre no puede decir cuánto ahorraste ni estimar el mes que viene.
              </p>
              <Button type="primary" onClick={() => setEditando(true)}>Cargar el sueldo</Button>
            </>
          )}
        </>
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space wrap>
            <Select value={mes} onChange={setMes} options={OPCIONES} style={{ width: 200 }} />
            <InputNumber
              value={ars} onChange={setArs} min={0} style={{ width: 180 }}
              formatter={agruparMiles} parser={desagruparMiles}
              prefix="$" aria-label="Neto en pesos" placeholder="Neto en pesos"
            />
            <InputNumber
              value={usd} onChange={setUsd} min={0} style={{ width: 180 }}
              formatter={agruparMiles} parser={desagruparMiles}
              prefix="U$S" aria-label="Neto en dólares" placeholder="Neto en dólares"
            />
          </Space>
          <Reparto {...enVivo} />
          <Space wrap>
            <Button type="primary" onClick={guardar} loading={ocupado}>Guardar</Button>
            <Button onClick={() => setEditando(false)}>Cancelar</Button>
          </Space>
          {/* Dos cosas que no son obvias y que cambian como se carga: que no
              hay que convertir nada, y que esto le gana al recibo. Si no se
              dice lo segundo, parece que el proximo sync lo va a pisar. */}
          <p className="nota">
            Cargalo como te entra: la parte en pesos por un lado y la parte en dólares por otro,
            sin convertir nada — la conversión la hace el cierre con el tipo de cambio de ese mes.
            Lo que pongas acá le gana al recibo: la próxima sincronización no lo va a pisar.
          </p>
          {error && <Text type="danger" className="resultado">{error}</Text>}
        </Space>
      )}
    </section>
  );
}

// Cuanto del sueldo viene en cada moneda. Es el dato que uno mira cuando cobra
// partido y quiere saber si el reparto se le corrio.
function Reparto({ total, pctArs, pctUsd }: ReturnType<typeof mezcla>) {
  if (total.ars === 0 && total.usd === 0) return null;

  if (total.totalArs === null) {
    return (
      <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
        Falta el tipo de cambio de este mes, así que las dos partes no se pueden sumar en pesos.
        Cargalo en Supuestos y el reparto aparece solo.
      </p>
    );
  }

  return (
    <p className="resultado">
      En total <span className="monto ars">{fmtArs(total.totalArs)}</span>
      {pctUsd !== null && pctArs !== null && total.usd > 0 && (
        <> · {fmtPct(pctUsd)} en dólares, {fmtPct(pctArs)} en pesos</>
      )}
    </p>
  );
}
