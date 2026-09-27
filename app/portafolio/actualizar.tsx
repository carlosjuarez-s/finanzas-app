'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InputNumber, Segmented, Space, Tag, Typography } from 'antd';
import {
  ajustesDeLibro, datosDeActivos, estadoFinal, totalesPorActivo,
  type FilaConciliacion, type FuentePrecio, type Tenencia, type TipoCambio,
} from '@/lib/conciliar';
import type { Propuesta } from '@/lib/conciliar-servidor';
import { agruparMiles, desagruparMiles, fmtPeriodo, fmtUsd } from '@/lib/formato';

const { Text } = Typography;

type Respuesta = Propuesta & { hallazgos?: string[] };
type Hecho = {
  periodo: string; cuentas: string[];
  anotadas: { activo: string; tipo: 'COMPRA' | 'VENTA'; cantidad: number; precioUsd: number }[];
  sinAnotar: string[];
};

const cant = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 8 });

// La etiqueta dice que PASA, no que tipo de fila es. Y va en texto, no solo en
// color: «nuevo» y «sube» en dos verdes parecidos no se distinguen.
const ETIQUETA: Record<TipoCambio, { texto: string; color?: string }> = {
  NUEVO: { texto: 'nuevo', color: 'blue' },
  SUBE: { texto: 'sube', color: 'green' },
  BAJA: { texto: 'baja', color: 'orange' },
  FALTA: { texto: 'no aparece', color: 'red' },
  IGUAL: { texto: 'igual' },
};

const FUENTE: Record<FuentePrecio, string> = {
  DICHO: 'el precio que escribiste',
  COSTO_BROKER: 'el costo promedio que muestra el broker',
  MERCADO: 'el precio de hoy: si fue en otro momento, poné el que corresponde',
  EFECTIVO: 'efectivo: 1 dólar por dólar',
};

export default function Actualizar() {
  const [modo, setModo] = useState<'foto' | 'texto'>('foto');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [texto, setTexto] = useState('');
  const [prop, setProp] = useState<Respuesta | null>(null);
  const [vendidos, setVendidos] = useState<Record<number, Set<string>>>({});
  const [precios, setPrecios] = useState<Record<string, number | null>>({});
  const [renombrar, setRenombrar] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState<'leer' | 'guardar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function empezar(p: Respuesta | null) {
    setProp(p);
    setVendidos(Object.fromEntries((p?.plataformas ?? []).map((x, i) => [i, new Set(x.quitados)])));
    setPrecios({});
    setRenombrar({});
  }

  async function pedir(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(cuerpo?.error ?? (res.status === 413
        ? 'Las capturas pesan demasiado juntas: subilas de a una o dos.'
        : `El servidor respondió ${res.status}`));
    }
    return cuerpo;
  }

  async function leer() {
    setOcupado('leer'); setError(null); setHecho(null); empezar(null);
    try {
      if (modo === 'foto') {
        const form = new FormData();
        archivos.forEach(f => form.append('fotos', f));
        empezar(await pedir('/api/portafolio/conciliar', { method: 'POST', body: form }));
      } else {
        empezar(await pedir('/api/portafolio/conciliar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }),
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  // Cada cuenta, ya decidido que pasa con lo que no aparece.
  const finales = useMemo(() => prop?.plataformas.map((p, i) => ({
    plataforma: p.plataforma,
    tenencias: estadoFinal(p.filas, vendidos[i] ?? new Set()),
  })) ?? [], [prop, vendidos]);

  // La misma cuenta que va a hacer el servidor al confirmar, aca para mostrarla
  // antes. El servidor la repite contra la base de ese momento: esto es la
  // vista previa, no la fuente de verdad.
  const ajustes = useMemo(() => {
    if (!prop) return [];
    const filas = prop.plataformas.flatMap(p => p.filas);
    const objetivo = totalesPorActivo([
      { plataforma: '', periodo: '', totalUsd: null, tenencias: Object.entries(prop.otras).map(([activo, cantidad]) => ({ activo, clase: '', cantidad, valorUsd: null })) },
      ...finales.map(f => ({ plataforma: f.plataforma, periodo: '', totalUsd: null, tenencias: f.tenencias })),
    ]);
    const libro = new Map(Object.entries(prop.libro));
    return ajustesDeLibro(objetivo, libro, filas.map(f => f.activo), datosDeActivos(filas, prop.dichos), prop.hoy);
  }, [prop, finales]);

  async function reasignar(i: number) {
    const nombre = (renombrar[i] ?? '').trim();
    if (!prop || !nombre) return;
    setOcupado('leer'); setError(null);
    try {
      const otra: Respuesta = await pedir('/api/portafolio/conciliar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plataforma: nombre, tenencias: finales[i].tenencias }),
      });
      const plataformas = [...prop.plataformas];
      plataformas[i] = otra.plataformas[0];
      // Solo cambia esa cuenta: lo decidido en las demas se conserva.
      setProp({ ...prop, plataformas, libro: { ...prop.libro, ...otra.libro }, otras: { ...prop.otras, ...otra.otras } });
      setVendidos(v => ({ ...v, [i]: new Set() }));
      setRenombrar(r => { const x = { ...r }; delete x[i]; return x; });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function confirmar() {
    if (!prop) return;
    setOcupado('guardar'); setError(null);
    try {
      const r: Hecho = await pedir('/api/portafolio/aplicar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plataformas: finales, precios, dichos: prop.dichos }),
      });
      setHecho(r);
      empezar(null);
      setArchivos([]);
      setTexto('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  const precioElegido = (activo: string, sugerido: number | null) =>
    activo in precios ? precios[activo] : sugerido;
  const hayCambios = !!prop && (prop.plataformas.some(p => p.filas.some(f => f.tipo !== 'IGUAL')) || ajustes.length > 0);

  return (
    <section>
      <h2>Actualizar lo que tenés</h2>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary" className="resultado" style={{ display: 'block' }}>
          Mostrá lo que tenés hoy y la app deduce qué es nuevo y qué es un ajuste. No suma encima
          de lo que ya estaba: reemplaza la foto de esa cuenta, así cargar la misma captura dos
          veces no duplica nada.
        </Text>

        <Segmented
          size="large"
          value={modo}
          onChange={v => { setModo(v as 'foto' | 'texto'); setError(null); }}
          options={[{ value: 'foto', label: 'Capturas' }, { value: 'texto', label: 'Escribir' }]}
        />

        {modo === 'foto' ? (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <input
              ref={input} type="file" accept="image/*,application/pdf" multiple hidden
              onChange={e => { setArchivos(a => [...a, ...Array.from(e.target.files ?? [])].slice(0, 8)); e.target.value = ''; }}
            />
            <Button size="large" onClick={() => input.current?.click()}>
              {archivos.length ? 'Agregar otra captura' : 'Elegir capturas'}
            </Button>
            {archivos.map((f, i) => (
              <div className="fila" key={`${f.name}-${i}`}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                <Button onClick={() => setArchivos(a => a.filter((_, j) => j !== i))}>Quitar</Button>
              </div>
            ))}
            <Text type="secondary" className="resultado" style={{ display: 'block' }}>
              Pueden ser de cuentas distintas (el banco, Binance, IOL): cada una se compara contra
              su última foto. Si una cuenta no entra en una captura, subí las dos.
            </Text>
          </Space>
        ) : (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Input.TextArea
              rows={3} value={texto} onChange={e => setTexto(e.target.value)} maxLength={2000}
              placeholder="Ej.: tengo 50 GGAL, no 40 · vendí todo el MELI · lo de IOL lo pasé a efectivo, 6400 USD"
            />
            <Text type="secondary" className="resultado" style={{ display: 'block' }}>
              Decí lo que tenés, no la cuenta: «tengo 50» y no «sumale 10». Si decís a cuánto
              compraste en dólares, se usa ese precio.
            </Text>
          </Space>
        )}

        <Button
          type="primary" size="large" onClick={leer} loading={ocupado === 'leer'}
          disabled={modo === 'foto' ? !archivos.length : texto.trim().length < 4}
        >
          Ver qué cambia
        </Button>

        {error && <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>{error}</p>}

        {hecho && (
          <p className="nota" style={{ borderLeftColor: 'var(--dolar)' }}>
            Listo: {hecho.cuentas.join(', ')} actualizado a {fmtPeriodo(hecho.periodo)}.
            {hecho.anotadas.length > 0 && ` En el libro: ${hecho.anotadas.map(a =>
              `${a.tipo === 'COMPRA' ? 'compra' : 'venta'} de ${cant(a.cantidad)} ${a.activo}`).join(', ')}.`}
            {hecho.sinAnotar.length > 0 && ` Sin anotar en el libro: ${hecho.sinAnotar.join(', ')}.`}
          </p>
        )}
      </Space>

      {prop && (
        <div style={{ marginTop: 16 }}>
          {prop.errores.map((e, i) => (
            <p className="nota" key={i} style={{ borderLeftColor: 'var(--alerta)' }}>{e}</p>
          ))}

          {prop.plataformas.map((p, i) => (
            <Cuenta
              key={`${p.plataforma}-${i}`}
              plataforma={p.plataforma}
              desde={p.desde}
              filas={p.filas}
              vendidos={vendidos[i] ?? new Set()}
              alternar={(activo, vendido) => setVendidos(v => {
                const s = new Set(v[i] ?? []);
                if (vendido) s.add(activo); else s.delete(activo);
                return { ...v, [i]: s };
              })}
              nombre={renombrar[i]}
              setNombre={n => setRenombrar(r => ({ ...r, [i]: n }))}
              reasignar={() => reasignar(i)}
              ocupado={ocupado !== null}
            />
          ))}

          {ajustes.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3>En el libro de operaciones</h3>
              <Text type="secondary" className="resultado" style={{ display: 'block', marginBottom: 8 }}>
                El libro es lo que calcula cuánto ganaste. Se ajusta por la diferencia entre lo que
                tenés y lo que ya tenía anotado: una operación por activo, no una por movimiento.
              </Text>
              {ajustes.map(a => {
                const elegido = precioElegido(a.activo, a.precioUsd);
                const anotar = elegido !== null;
                return (
                  <div key={a.activo} className="ajuste">
                    <div className="fila" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                      <span style={{ minWidth: 0 }}>
                        <strong>{a.tipo === 'COMPRA' ? 'Compra' : 'Venta'}</strong> de {cant(a.cantidad)} {a.activo}
                      </span>
                      {/* Un boton y no un switch: el switch de antd mide 22px y en el
                          celular no se acierta. */}
                      {anotar ? (
                        <Button onClick={() => setPrecios(pr => ({ ...pr, [a.activo]: null }))}>No anotar</Button>
                      ) : a.precioUsd !== null ? (
                        <Button onClick={() => setPrecios(pr => ({ ...pr, [a.activo]: a.precioUsd }))}>Anotar</Button>
                      ) : null}
                    </div>
                    {a.fuente !== 'EFECTIVO' && (
                      <Space wrap size="small" align="center" style={{ marginTop: 6 }}>
                        <InputNumber
                          size="large"
                          prefix="U$S" placeholder="Precio c/u"
                          value={elegido ?? undefined}
                          min={0}
                          formatter={agruparMiles}
                          parser={desagruparMiles}
                          onChange={v => setPrecios(pr => ({ ...pr, [a.activo]: typeof v === 'number' && v > 0 ? v : null }))}
                          style={{ width: 190 }}
                        />
                        {elegido !== null && (
                          <Text type="secondary" className="resultado">{fmtUsd(elegido * a.cantidad)} en total</Text>
                        )}
                      </Space>
                    )}
                    <Text type="secondary" className="resultado" style={{ display: 'block', marginTop: 4 }}>
                      {!anotar
                        ? 'No se anota: sin precio, la ganancia de este activo queda sin calcular y se avisa en «Revisar».'
                        : a.activo in precios ? 'El precio que pusiste.' : `Precio: ${FUENTE[a.fuente!]}.`}
                    </Text>
                  </div>
                );
              })}
            </div>
          )}

          {prop.hallazgos?.length ? (
            <Text type="secondary" className="resultado" style={{ display: 'block', marginTop: 8 }}>
              Se censuró antes de enviar: {prop.hallazgos.join(', ')}.
            </Text>
          ) : null}

          <Space wrap style={{ marginTop: 16 }}>
            <Button type="primary" size="large" onClick={confirmar} loading={ocupado === 'guardar'}
              disabled={!prop.plataformas.length || ocupado === 'leer'}>
              {hayCambios ? 'Confirmar y guardar' : 'Guardar igual (sin cambios)'}
            </Button>
            <Button size="large" onClick={() => empezar(null)} disabled={ocupado !== null}>Descartar</Button>
          </Space>
        </div>
      )}
    </section>
  );
}

function Cuenta({ plataforma, desde, filas, vendidos, alternar, nombre, setNombre, reasignar, ocupado }: {
  plataforma: string; desde: string | null; filas: FilaConciliacion[];
  vendidos: Set<string>; alternar: (activo: string, vendido: boolean) => void;
  nombre: string | undefined; setNombre: (n: string) => void; reasignar: () => void; ocupado: boolean;
}) {
  const cambian = filas.filter(f => f.tipo !== 'IGUAL');
  const iguales = filas.filter(f => f.tipo === 'IGUAL');
  const final: Tenencia[] = estadoFinal(filas, vendidos);
  const total = final.every(t => t.valorUsd !== null) ? final.reduce((s, t) => s + (t.valorUsd ?? 0), 0) : null;

  return (
    <div className="cuenta">
      <div className="fila" style={{ borderBottom: 'none' }}>
        <span style={{ minWidth: 0 }}>
          <strong>{plataforma}</strong>
          <span className="resultado" style={{ display: 'block' }}>
            {desde ? `Comparado con tu foto de ${fmtPeriodo(desde)}` : 'Cuenta nueva: no había nada cargado'}
          </span>
        </span>
        <span className="monto usd">{total !== null ? fmtUsd(total) : '—'}</span>
      </div>

      {cambian.map(f => (
        <div className="fila" key={f.activo}>
          <span style={{ minWidth: 0 }}>
            <strong>{f.activo}</strong>
            <Tag color={ETIQUETA[f.tipo].color} style={{ marginLeft: 6 }}>{ETIQUETA[f.tipo].texto}</Tag>
            <span className="resultado" style={{ display: 'block' }}>
              {f.tipo === 'NUEVO' ? cant(f.despues)
                : f.tipo === 'FALTA' ? `tenías ${cant(f.antes)}`
                : `${cant(f.antes)} → ${cant(f.despues)}`}
              {f.costoUsd !== null && f.tipo !== 'FALTA' && ` · costo ${fmtUsd(f.costoUsd)} c/u`}
            </span>
          </span>
          {f.tipo === 'FALTA' ? (
            // No aparecer no es haberlo vendido: la captura puede estar cortada.
            <Segmented
              size="large"
              value={vendidos.has(f.activo) ? 'no' : 'si'}
              onChange={v => alternar(f.activo, v === 'no')}
              options={[{ value: 'si', label: 'Sigue' }, { value: 'no', label: 'Ya no' }]}
            />
          ) : (
            <span className="monto usd">{f.valorUsd !== null ? fmtUsd(f.valorUsd) : '—'}</span>
          )}
        </div>
      ))}

      {iguales.length > 0 && (
        <p className="resultado" style={{ margin: '6px 0 0' }}>
          Sin cambios: {iguales.map(f => f.activo).join(', ')}.
        </p>
      )}

      {/* Si el modelo leyo mal de que cuenta es la captura, se reasigna. Cerrado
          por defecto: casi nunca hace falta y abierto ocupa media pantalla. */}
      {nombre === undefined ? (
        <Button style={{ marginTop: 8 }} onClick={() => setNombre('')}>¿Es otra cuenta?</Button>
      ) : (
        <Space wrap size="small" align="center" style={{ marginTop: 8 }}>
          <Input
            size="large" placeholder="Nombre de la cuenta" value={nombre} onChange={e => setNombre(e.target.value)}
            style={{ width: 180 }} maxLength={60} autoFocus
          />
          <Button size="large" onClick={reasignar} disabled={!nombre.trim() || ocupado}>Comparar con esa</Button>
        </Space>
      )}
    </div>
  );
}
