'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Select, Space, Popconfirm, Typography, Tag } from 'antd';
import { fmtArs, fmtUsd } from '@/lib/formato';
import { resumir, totales, ordenar, type PrestamoPersonal } from '@/lib/fiado';

const { Text } = Typography;

const fmt = (monto: number, moneda: string) => moneda === 'USD' ? fmtUsd(monto) : fmtArs(monto);

const ETIQUETA = {
  PENDIENTE: { texto: 'sin devolver', color: 'orange' },
  PARCIAL: { texto: 'devolvió parte', color: 'blue' },
  SALDADO: { texto: 'saldado', color: 'green' },
  PERDONADO: { texto: 'dado por perdido', color: undefined },
} as const;

export default function Fiado({ prestamos, hoy }: { prestamos: PrestamoPersonal[]; hoy: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [alta, setAlta] = useState(false);

  const pendientes = totales(prestamos, hoy);
  const lista = ordenar(prestamos, hoy);

  return (
    <section>
      <h2>
        Plata que prestaste
        {pendientes.map(t => (
          <span className="chip" key={t.moneda}>{fmt(t.pendiente, t.moneda)} sin devolver</span>
        ))}
      </h2>

      {/* La aclaracion no es letra chica: es el motivo de que esta seccion
          exista aparte y no como un gasto mas. */}
      <p className="resultado">
        Esto no es un gasto: la plata salió de tu bolsillo pero sigue siendo tuya. Por eso
        no entra en el cierre del mes ni te baja la tasa de ahorro — lo que cambió es en qué
        forma la tenés.
      </p>

      {!prestamos.length && (
        <p className="resultado">
          Sin préstamos anotados. Cargá uno cuando le prestes a alguien y anotá cada
          devolución: es justo lo que después nadie se acuerda.
        </p>
      )}

      {lista.map(p => (
        <Fila
          key={p.id} prestamo={p} hoy={hoy}
          abierta={abierto === p.id}
          abrir={() => setAbierto(p.id)}
          cerrar={() => setAbierto(null)}
        />
      ))}

      {alta
        ? <Formulario onListo={() => setAlta(false)} onCancelar={() => setAlta(false)} />
        : <Button onClick={() => setAlta(true)} style={{ marginTop: 10 }}>Anoté un préstamo</Button>}
    </section>
  );
}

function Fila({ prestamo: p, hoy, abierta, abrir, cerrar }: {
  prestamo: PrestamoPersonal; hoy: string;
  abierta: boolean; abrir: () => void; cerrar: () => void;
}) {
  const [cobrando, setCobrando] = useState(false);
  const r = resumir(p, hoy);
  const et = ETIQUETA[r.estado];

  if (abierta) return <Formulario prestamo={p} onListo={cerrar} onCancelar={cerrar} />;

  const meses = r.diasDesde === null ? null : Math.floor(r.diasDesde / 30);

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px dotted var(--linea)' }}>
      <div className="fila fila-fiado" style={{ border: 'none', padding: 0 }}>
        <span>
          <strong>{p.persona}</strong>
          <Tag color={et.color} style={{ marginLeft: 6 }}>{et.texto}</Tag>
          <span className="resultado" style={{ display: 'block' }}>
            {p.concepto ? `${p.concepto} · ` : ''}{p.fecha}
            {/* Los meses transcurridos son lo que hace visible un prestamo
                olvidado: "hace 8 meses" pesa distinto que una fecha. */}
            {meses !== null && meses >= 1 && r.pendiente > 0 && ` · hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`}
          </span>
          {r.devuelto > 0 && (
            <span className="resultado" style={{ display: 'block' }}>
              Devolvió {fmt(r.devuelto, p.moneda)} de {fmt(p.monto, p.moneda)}
              {r.ultimaDevolucion && ` · última el ${r.ultimaDevolucion}`}
            </span>
          )}
          {r.avance > 0 && r.avance < 1 && (
            <span className="avance" aria-hidden="true"><span style={{ width: `${r.avance * 100}%` }} /></span>
          )}
        </span>

        <span className="fiado-acciones">
          <span className="monto" style={{ color: r.pendiente > 0 ? 'var(--alerta)' : 'var(--tinta-suave)' }}>
            {r.pendiente > 0 ? fmt(r.pendiente, p.moneda) : '—'}
          </span>
          <Space size={4} style={{ display: 'flex', marginTop: 6 }} wrap>
            {r.pendiente > 0 && (
              <Button size="small" type="primary" onClick={() => setCobrando(v => !v)}>
                Me devolvió
              </Button>
            )}
            <Button size="small" onClick={abrir}>Editar</Button>
          </Space>
        </span>
      </div>

      {cobrando && (
        <Devolver prestamo={p} pendiente={r.pendiente} onListo={() => setCobrando(false)} />
      )}
    </div>
  );
}

/** Carga de una devolucion parcial: el caso normal, no la excepcion. */
function Devolver({ prestamo: p, pendiente, onListo }: {
  prestamo: PrestamoPersonal; pendiente: number; onListo: () => void;
}) {
  const [monto, setMonto] = useState<number | null>(pendiente);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function guardar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/fiado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidad: 'devolucion', prestamoId: p.id, monto, fecha }),
      });
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

  return (
    <Space wrap style={{ marginTop: 10 }}>
      <InputNumber value={monto} onChange={setMonto} min={0.01} style={{ width: 160 }}
        placeholder="Cuánto devolvió" prefix={p.moneda === 'USD' ? 'U$S' : '$'} />
      <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: 150 }} />
      <Button size="small" type="primary" onClick={guardar} loading={ocupado}>Anotar</Button>
      <Button size="small" onClick={onListo}>Cancelar</Button>
      {error && <Text type="danger" className="resultado">{error}</Text>}
    </Space>
  );
}

function Formulario({ prestamo, onListo, onCancelar }: {
  prestamo?: PrestamoPersonal; onListo: () => void; onCancelar: () => void;
}) {
  const [f, setF] = useState({
    persona: prestamo?.persona ?? '',
    concepto: prestamo?.concepto ?? '',
    monto: prestamo?.monto ?? null as number | null,
    moneda: prestamo?.moneda ?? 'ARS',
    fecha: prestamo?.fecha ?? new Date().toISOString().slice(0, 10),
    perdonado: prestamo?.perdonado ?? false,
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function pedir(init: RequestInit, url = '/api/fiado') {
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
    body: JSON.stringify({ ...f, id: prestamo?.id }),
  });

  const borrar = () => pedir({ method: 'DELETE' }, `/api/fiado?id=${encodeURIComponent(prestamo!.id)}`);

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px dotted var(--linea)' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          <Input placeholder="A quién le prestaste" value={f.persona}
            onChange={e => setF(s => ({ ...s, persona: e.target.value }))} style={{ minWidth: 200 }} />
          <Input placeholder="Para qué (opcional)" value={f.concepto}
            onChange={e => setF(s => ({ ...s, concepto: e.target.value }))} style={{ minWidth: 200 }} />
        </Space>

        <Space wrap>
          <InputNumber placeholder="Cuánto" value={f.monto} min={0.01}
            onChange={v => setF(s => ({ ...s, monto: v }))} style={{ width: 160 }} />
          <Select value={f.moneda} onChange={v => setF(s => ({ ...s, moneda: v }))} style={{ width: 90 }}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
          <Input type="date" value={f.fecha}
            onChange={e => setF(s => ({ ...s, fecha: e.target.value }))} style={{ width: 150 }} />
        </Space>

        {prestamo && (
          <Space wrap>
            <Select value={f.perdonado ? 'si' : 'no'} style={{ width: 210 }}
              onChange={v => setF(s => ({ ...s, perdonado: v === 'si' }))}
              options={[
                { value: 'no', label: 'Espero que me lo devuelva' },
                { value: 'si', label: 'Lo doy por perdido' },
              ]} />
            <Text type="secondary" className="resultado">
              Darlo por perdido lo saca de lo que esperás cobrar, pero no borra el registro.
            </Text>
          </Space>
        )}

        <Space wrap>
          <Button type="primary" size="small" onClick={guardar} loading={ocupado}>Guardar</Button>
          <Button size="small" onClick={onCancelar}>Cancelar</Button>
          {prestamo && (
            <Popconfirm
              title={`¿Borrar el préstamo a ${prestamo.persona}?`}
              description="Se borran también las devoluciones anotadas."
              onConfirm={borrar} okText="Borrar" cancelText="No"
            >
              <Button size="small" danger>Borrar</Button>
            </Popconfirm>
          )}
        </Space>
        {error && <Text type="danger" className="resultado">{error}</Text>}
      </Space>
    </div>
  );
}
