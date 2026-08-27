'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Popconfirm, Typography, Tag } from 'antd';
import { fmtArs, fmtPeriodo } from '@/lib/formato';
import { estado, type Prestamo } from '@/lib/prestamos';

const { Text } = Typography;

export default function Prestamos({ prestamos, periodo }: { prestamos: Prestamo[]; periodo: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [alta, setAlta] = useState(false);

  const estados = prestamos.map(p => ({ p, e: estado(p, periodo) }));
  const vigentes = estados.filter(x => !x.e.terminado && !x.e.cancelado);

  const cuotaDelMes = estados.reduce((s, x) => s + (x.e.cuotaDelMes === null ? 0 : x.p.cuotaArs), 0);
  const deuda = vigentes.reduce((s, x) => s + x.e.saldoArs, 0);

  return (
    <section>
      <h2>
        Préstamos y créditos
        {cuotaDelMes > 0 && <span className="chip">{fmtArs(cuotaDelMes)} este mes</span>}
      </h2>

      {prestamos.length === 0 ? (
        <p className="resultado">
          Sin préstamos cargados. Si estás pagando cuotas de un crédito, cargalo acá una vez y
          la cuota se suma sola a cada mes: no hace falta anotarla mes a mes.
        </p>
      ) : (
        <>
          {deuda > 0 && (
            <p className="resultado">
              Te falta pagar <span className="monto ars">{fmtArs(deuda)}</span> entre{' '}
              {vigentes.reduce((s, x) => s + x.e.restantes, 0)} cuotas. Eso ya está comprometido:
              no es plata disponible para una meta.
            </p>
          )}

          {estados.map(({ p, e }) => (
            <Fila
              key={p.id} prestamo={p} est={e}
              abierta={abierto === p.id}
              abrir={() => setAbierto(p.id)}
              cerrar={() => setAbierto(null)}
            />
          ))}
        </>
      )}

      {/* La cuota se calcula desde el plan. Si ademas se carga como gasto
          suelto, o si el credito debita en la tarjeta, se cuenta dos veces. */}
      <p className="nota">
        La cuota del mes se suma sola al cierre, en la categoría «Cuotas». No la cargues
        también como gasto suelto. Y si el crédito te debita en el resumen de la tarjeta,
        tampoco lo cargues acá: ya está contado ahí.
      </p>

      {alta
        ? <Formulario onListo={() => setAlta(false)} onCancelar={() => setAlta(false)} />
        : <Button onClick={() => setAlta(true)} style={{ marginTop: 10 }}>Agregar un préstamo</Button>}
    </section>
  );
}

function Fila({ prestamo: p, est, abierta, abrir, cerrar }: {
  prestamo: Prestamo;
  est: ReturnType<typeof estado>;
  abierta: boolean; abrir: () => void; cerrar: () => void;
}) {
  if (abierta) return <Formulario prestamo={p} onListo={cerrar} onCancelar={cerrar} />;

  const avance = Math.round((est.pagadas / p.cuotas) * 100);

  return (
    <div className="fila">
      <span>
        <strong>{p.nombre}</strong>
        {p.entidad && <span className="chip">{p.entidad}</span>}
        {est.terminado && !est.cancelado && <Tag color="green" style={{ marginLeft: 6 }}>terminado</Tag>}
        {est.cancelado && <Tag style={{ marginLeft: 6 }}>cancelado</Tag>}

        <span className="resultado" style={{ display: 'block' }}>
          {est.pagadas} de {p.cuotas} cuotas · {fmtArs(p.cuotaArs)} c/u
          {!est.terminado && ` · última en ${fmtPeriodo(est.ultimoPeriodo)}`}
        </span>

        {/* Barra de avance: el numero de cuotas dice poco sin ver cuanto falta. */}
        <span className="avance" aria-hidden="true">
          <span style={{ width: `${avance}%` }} />
        </span>

        {est.costoArs !== null && (
          <span className="resultado" style={{ display: 'block' }}>
            Te dieron {fmtArs(p.montoOtorgado ?? 0)} y vas a devolver {fmtArs(est.totalArs)}:
            el crédito cuesta {fmtArs(est.costoArs)}
            {p.cftAnual ? ` · CFT ${p.cftAnual}%` : ''}
          </span>
        )}
      </span>

      <span style={{ textAlign: 'right' }}>
        <span className="monto ars">{est.restantes ? fmtArs(est.saldoArs) : '—'}</span>
        <span className="resultado" style={{ display: 'block', fontSize: 12 }}>
          {est.restantes ? `${est.restantes} por pagar` : 'saldado'}
        </span>
        <Button size="small" onClick={abrir} style={{ marginTop: 6 }}>Editar</Button>
      </span>
    </div>
  );
}

function Formulario({ prestamo, onListo, onCancelar }: {
  prestamo?: Prestamo; onListo: () => void; onCancelar: () => void;
}) {
  const [f, setF] = useState({
    nombre: prestamo?.nombre ?? '',
    entidad: prestamo?.entidad ?? '',
    montoOtorgado: prestamo?.montoOtorgado ?? null as number | null,
    cuotas: prestamo?.cuotas ?? null as number | null,
    cuotaArs: prestamo?.cuotaArs ?? null as number | null,
    primerPeriodo: prestamo?.primerPeriodo ?? new Date().toISOString().slice(0, 7),
    moneda: prestamo?.moneda ?? 'ARS',
    cftAnual: prestamo?.cftAnual ?? null as number | null,
    canceladoEn: prestamo?.canceladoEn ?? '',
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function pedir(init: RequestInit, url = '/api/prestamos') {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      onListo();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = () => pedir({
    method: prestamo ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...f, id: prestamo?.id, canceladoEn: f.canceladoEn || null }),
  });

  const borrar = () => pedir({ method: 'DELETE' }, `/api/prestamos?id=${encodeURIComponent(prestamo!.id)}`);

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px dotted var(--linea)' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          <Input placeholder="Nombre (ej: préstamo del auto)" value={f.nombre}
            onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} style={{ minWidth: 240 }} />
          <Input placeholder="Banco o financiera" value={f.entidad}
            onChange={e => setF(s => ({ ...s, entidad: e.target.value }))} style={{ minWidth: 180 }} />
        </Space>

        <Space wrap>
          <InputNumber placeholder="Cuántas cuotas" value={f.cuotas} min={1} precision={0}
            onChange={v => setF(s => ({ ...s, cuotas: v }))} style={{ width: 150 }} />
          <InputNumber placeholder="Monto de la cuota" value={f.cuotaArs} min={0}
            onChange={v => setF(s => ({ ...s, cuotaArs: v }))} style={{ width: 180 }} />
          <Select value={f.moneda} onChange={v => setF(s => ({ ...s, moneda: v }))} style={{ width: 90 }}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
        </Space>

        <Space wrap>
          <Input type="month" value={f.primerPeriodo}
            onChange={e => setF(s => ({ ...s, primerPeriodo: e.target.value }))} style={{ width: 180 }} />
          <Text type="secondary" className="resultado">Mes de la primera cuota</Text>
        </Space>

        <Space wrap>
          <InputNumber placeholder="Monto que te dieron" value={f.montoOtorgado} min={0}
            onChange={v => setF(s => ({ ...s, montoOtorgado: v }))} style={{ width: 200 }} />
          <InputNumber placeholder="CFT anual" value={f.cftAnual} min={0} suffix="%"
            onChange={v => setF(s => ({ ...s, cftAnual: v }))} style={{ width: 140 }} />
          <Text type="secondary" className="resultado">
            Opcionales: sirven para ver cuánto te cuesta el crédito.
          </Text>
        </Space>

        {prestamo && (
          <Space wrap>
            <Input type="month" value={f.canceladoEn}
              onChange={e => setF(s => ({ ...s, canceladoEn: e.target.value }))} style={{ width: 180 }} />
            <Text type="secondary" className="resultado">
              ¿Lo cancelaste antes? Desde ese mes deja de sumar.
            </Text>
          </Space>
        )}

        <Space wrap>
          <Button type="primary" size="small" onClick={guardar} loading={ocupado}>Guardar</Button>
          <Button size="small" onClick={onCancelar}>Cancelar</Button>
          {prestamo && (
            <Popconfirm title={`¿Borrar "${prestamo.nombre}"?`} onConfirm={borrar} okText="Borrar" cancelText="No">
              <Button size="small" danger>Borrar</Button>
            </Popconfirm>
          )}
        </Space>
        {error && <Text type="danger" className="resultado">{error}</Text>}
      </Space>
    </div>
  );
}
