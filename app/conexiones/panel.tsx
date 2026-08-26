'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Space, Typography, Tag, Popconfirm, Alert } from 'antd';
import { PLATAFORMAS, listaPlataformas, type PlataformaId } from '@/lib/plataformas';
import type { ConexionVisible } from '@/lib/conexiones';

const { Text } = Typography;

export default function Panel({ conexiones, bovedaLista }: { conexiones: ConexionVisible[]; bovedaLista: boolean }) {
  const [plataforma, setPlataforma] = useState<PlataformaId>('BINANCE');
  const [etiqueta, setEtiqueta] = useState('');
  const [credencial, setCredencial] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ conexion: string; estado: string; detalle: string }[] | null>(null);
  const router = useRouter();

  const def = PLATAFORMAS[plataforma];

  async function pedir(url: string, init: RequestInit) {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      router.refresh();
      return cuerpo;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function conectar() {
    const r = await pedir('/api/conexiones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plataforma, etiqueta, credencial }),
    });
    if (r) { setCredencial({}); setEtiqueta(''); }
  }

  async function sincronizar() {
    setSync(null);
    const r = await pedir('/api/sync-portafolio', { method: 'POST' });
    if (r?.resultados) setSync(r.resultados);
  }

  return (
    <>
      {!bovedaLista && (
        <Alert
          type="warning"
          style={{ marginBottom: 20 }}
          message="Falta la clave de la bóveda"
          description={
            <span className="resultado">
              Sin <code className="monto">BOVEDA_CLAVE_1</code> en Vercel no se pueden guardar
              credenciales cifradas. Generala con{' '}
              <code className="monto">node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;</code>{' '}
              y guardala también en tu gestor de contraseñas: si la perdés, las credenciales
              ya guardadas no se recuperan.
            </span>
          }
        />
      )}

      <section>
        <h2>Conectar una cuenta</h2>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Select
              value={plataforma}
              onChange={v => { setPlataforma(v); setCredencial({}); }}
              style={{ width: 180 }}
              options={listaPlataformas().map(p => ({ value: p.id, label: p.nombre }))}
            />
            <Input
              placeholder={`Etiqueta (ej: ${def.nombre} principal)`}
              value={etiqueta}
              onChange={e => setEtiqueta(e.target.value)}
              style={{ minWidth: 220 }}
            />
          </Space>

          {/* La advertencia no es letra chica: es lo que necesitás saber para
              decidir si querés conectar esta plataforma. */}
          <Alert
            type={def.lecturaGarantizadaPorLaPlataforma ? 'info' : 'error'}
            message={
              def.lecturaGarantizadaPorLaPlataforma
                ? 'La plataforma garantiza la solo lectura'
                : 'La solo lectura acá la garantiza únicamente esta app'
            }
            description={<span className="resultado">{def.advertencia}</span>}
          />

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {def.campos.map(c => (
              <Space key={c.nombre} wrap>
                <Input
                  placeholder={c.etiqueta}
                  type={c.tipo === 'password' ? 'password' : 'text'}
                  value={credencial[c.nombre] ?? ''}
                  onChange={e => setCredencial(s => ({ ...s, [c.nombre]: e.target.value }))}
                  style={{ minWidth: 280 }}
                  autoComplete="off"
                />
                {c.ayuda && <Text type="secondary" className="resultado">{c.ayuda}</Text>}
              </Space>
            ))}
          </Space>

          <Space wrap>
            <Button
              type="primary"
              onClick={conectar}
              loading={ocupado}
              disabled={!bovedaLista || def.campos.some(c => !credencial[c.nombre]?.trim())}
            >
              Conectar
            </Button>
            {error && <Text type="danger" className="resultado">{error}</Text>}
          </Space>
        </Space>
      </section>

      <section>
        <h2>Cuentas conectadas</h2>
        {!conexiones.length && <p className="resultado">Todavía no hay ninguna.</p>}

        {conexiones.map(c => (
          <div className="fila" key={c.id}>
            <span>
              <strong>{c.etiqueta}</strong>
              <span className="chip">{c.nombrePlataforma}</span>
              <span className="chip">{c.pista}</span>
              {!c.lecturaGarantizadaPorLaPlataforma && <Tag color="red" style={{ marginLeft: 6 }}>acceso total</Tag>}
              {c.estado === 'ERROR' && <Tag color="orange" style={{ marginLeft: 6 }}>error</Tag>}
              {c.ultimoError && <span className="resultado" style={{ display: 'block' }}>{c.ultimoError}</span>}
            </span>
            <Popconfirm title={`¿Borrar "${c.etiqueta}"?`} onConfirm={() => pedir(`/api/conexiones?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' })} okText="Borrar" cancelText="No">
              <Button size="small" danger>Borrar</Button>
            </Popconfirm>
          </div>
        ))}

        {conexiones.length > 0 && (
          <Space wrap style={{ marginTop: 14 }}>
            <Button onClick={sincronizar} loading={ocupado}>Sincronizar tenencias</Button>
            {sync?.map((r, i) => (
              <Text key={i} type={r.estado === 'ok' ? 'success' : 'danger'} className="resultado">
                {r.conexion}: {r.detalle}
              </Text>
            ))}
          </Space>
        )}
      </section>
    </>
  );
}
