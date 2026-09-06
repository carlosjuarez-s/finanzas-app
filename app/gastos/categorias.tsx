'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Space, Tag, Typography } from 'antd';
import { COMODIN } from '@/lib/categorias';

const { Text } = Typography;

/**
 * Editar en que rubros se divide el gasto.
 *
 * Es lo primero que necesita alguien que no sea el dueño original: las doce
 * iniciales son los rubros de una persona concreta. Quien tiene mascotas,
 * hijos o monotributo necesita las suyas, y sin poder cambiarlas la app le
 * clasifica todo mal desde el primer documento.
 */
export default function Categorias({ categorias }: { categorias: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState(categorias);
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const esComodin = (c: string) => c.toLowerCase() === COMODIN.toLowerCase();

  function agregar() {
    const n = nueva.trim();
    if (!n) return;
    if (lista.some(c => c.toLowerCase() === n.toLowerCase())) {
      setError(`«${n}» ya está en la lista.`);
      return;
    }
    setError(null);
    // Antes del comodin: "Otros" va siempre al final, que es donde se lo busca.
    setLista([...lista.filter(c => !esComodin(c)), n, ...lista.filter(esComodin)]);
    setNueva('');
  }

  async function guardar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/categorias', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorias: lista }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${res.status}`);
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!abierto) {
    return (
      <section>
        <h2>Tus categorías <span className="chip">{categorias.length}</span></h2>
        <p className="resultado">
          En estos rubros se divide tu gasto. El modelo elige entre estos y no entre una lista
          fija, así que cambiarlos cambia cómo se clasifica lo que subís de acá en adelante.
        </p>
        <Space wrap size={[6, 6]} style={{ margin: '10px 0' }}>
          {categorias.map(c => <Tag key={c}>{c}</Tag>)}
        </Space>
        <div><Button onClick={() => setAbierto(true)}>Cambiar categorías</Button></div>
      </section>
    );
  }

  return (
    <section>
      <h2>Tus categorías</h2>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap size={[6, 6]}>
          {lista.map(c => (
            <Tag
              key={c}
              closable={!esComodin(c)}
              onClose={() => setLista(lista.filter(x => x !== c))}
            >
              {c}
            </Tag>
          ))}
        </Space>

        <Space wrap>
          <Input
            placeholder="Agregar una categoría"
            value={nueva}
            onChange={e => setNueva(e.target.value)}
            onPressEnter={agregar}
            style={{ minWidth: 220 }}
          />
          <Button onClick={agregar}>Agregar</Button>
        </Space>

        <p className="nota">
          «{COMODIN}» no se puede borrar: es donde cae lo que el modelo no supo clasificar.
          Sin ella, un gasto mal interpretado no tendría dónde ir.
        </p>
        <p className="nota">
          Cambiar o borrar una categoría no toca los gastos ya cargados: siguen con el nombre
          que tenían. Lo que cambia es cómo se clasifica de acá en adelante.
        </p>

        <Space wrap>
          <Button type="primary" onClick={guardar} loading={ocupado}>Guardar</Button>
          <Button onClick={() => { setLista(categorias); setAbierto(false); setError(null); }}>
            Cancelar
          </Button>
        </Space>
        {error && <Text type="danger" className="resultado">{error}</Text>}
      </Space>
    </section>
  );
}
