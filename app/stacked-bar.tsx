'use client';

import { useState } from 'react';
import { fmtArs, fmtUsd, fmtCorto } from '@/lib/formato';

// Parte-de-un-todo. No es una torta.
//
// Una torta obliga a comparar angulos, que el ojo hace mal: dos porciones
// parecidas son indistinguibles y hay que ir a leer los numeros igual. Una
// barra apilada muestra lo mismo —cuanto pesa cada parte del total— pero se
// compara contra una linea recta, que es lo que el ojo si hace bien. Y con
// nombres largos ("Servicios y otros gastos") no hay que rotar ni sacar
// etiquetas afuera con lineas guia.
//
// Tres segmentos como maximo: la paleta esta validada para tres, y mas partes
// en una barra de este alto dejan de leerse. El resto se agrupa antes de llegar
// acá.

const FORMATOS = { corto: fmtCorto, ars: fmtArs, usd: fmtUsd } as const;

export type Parte = { etiqueta: string; valor: number; color: string };

type Props = {
  partes: Parte[];
  formato?: keyof typeof FORMATOS;
  /** Total contra el que se mide. Por defecto, la suma de las partes. */
  total?: number;
};

export default function StackedBar({ partes, formato = 'ars', total }: Props) {
  const [activo, setActivo] = useState<number | null>(null);
  const fmt = FORMATOS[formato];

  const visibles = partes.filter(p => p.valor > 0);
  if (!visibles.length) return null;

  const suma = visibles.reduce((s, p) => s + p.valor, 0);
  const base = total && total > 0 ? total : suma;
  const pct = (v: number) => (v / base) * 100;

  return (
    <div className="grafico">
      <div
        className="apilada"
        role="img"
        aria-label={visibles.map(p => `${p.etiqueta}: ${fmt(p.valor)}`).join('. ')}
      >
        {visibles.map((p, i) => {
          const ancho = pct(p.valor);
          // La etiqueta va adentro solo si entra comoda. Un texto recortado a
          // la mitad es peor que no ponerlo: para eso estan la leyenda y la
          // tabla, que nunca esconden un valor.
          const entra = ancho >= 16;
          return (
            <span
              key={p.etiqueta}
              className="apilada-parte"
              style={{
                width: `${ancho}%`,
                background: p.color,
                opacity: activo === null || activo === i ? 1 : 0.5,
              }}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
            >
              {entra && <span className="apilada-adentro">{Math.round(ancho)}%</span>}
            </span>
          );
        })}
      </div>

      {/* La leyenda siempre esta: la identidad no puede depender solo del color. */}
      <ul className="leyenda-apilada">
        {visibles.map((p, i) => (
          <li
            key={p.etiqueta}
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
            style={{ opacity: activo === null || activo === i ? 1 : 0.55 }}
          >
            <span className="marca" style={{ background: p.color }} />
            <span>{p.etiqueta}</span>
            <span className="monto">{fmt(p.valor)}</span>
          </li>
        ))}
      </ul>

      <details className="tabla-gemela">
        <summary>Ver los datos como tabla</summary>
        <table>
          <thead><tr><th>Concepto</th><th>Monto</th><th>Del total</th></tr></thead>
          <tbody>
            {visibles.map(p => (
              <tr key={p.etiqueta}>
                <td>{p.etiqueta}</td>
                <td className="monto">{fmt(p.valor)}</td>
                <td className="monto">{pct(p.valor).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
