'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fmtArs, fmtUsd, fmtCorto, fmtPct } from '@/lib/formato';

// Barras horizontales, no verticales: las etiquetas son nombres de activos y
// categorias, y en vertical se pisan o hay que rotarlas.
//
// Tampoco es una torta. Una torta sirve para parte-de-un-todo de un vistazo con
// pocos segmentos; para comparar valores parecidos —que es lo que uno hace con
// un portafolio— las barras se leen mucho mejor.

const FORMATOS = { corto: fmtCorto, ars: fmtArs, usd: fmtUsd, pct: fmtPct } as const;

export type Barra = {
  etiqueta: string;
  valor: number;
  nota?: string;
  /** Si la barra lleva a algun lado, la fila entera es el link. */
  href?: string;
};

type Props = {
  datos: Barra[];
  formato?: keyof typeof FORMATOS;
  /** Con valores negativos las barras crecen desde un cero al medio. */
  divergente?: boolean;
  max?: number;
};

export default function BarChart({ datos, formato = 'corto', divergente = false, max }: Props) {
  const [activo, setActivo] = useState<number | null>(null);
  const fmt = FORMATOS[formato];

  if (!datos.length) return null;

  const tope = max ?? Math.max(...datos.map(d => Math.abs(d.valor)), 1);

  return (
    <div className="grafico">
      <div className="barras">
        {datos.map((d, i) => {
          const ancho = (Math.abs(d.valor) / tope) * (divergente ? 50 : 100);
          const negativo = d.valor < 0;
          // El color codifica el signo, que es informacion, no decoracion. En el
          // modo simple todas van del mismo color: una sola serie no necesita
          // que cada barra tenga su hue.
          const color = divergente
            ? (negativo ? 'var(--alerta)' : 'var(--dolar)')
            : 'var(--peso)';

          // Con href la fila entera es el link, no solo la etiqueta: el
          // objetivo tactil pasa a ser toda la barra. Se escriben las dos ramas
          // en vez de un componente dinamico: `<Fila>` con href opcional no
          // tipa, porque Link exige href y div no lo acepta.
          const dentro = (
            <>
              <span className="barra-etiqueta">{d.etiqueta}</span>

              <span className="barra-pista">
                {divergente && <span className="barra-cero" />}
                <span
                  className="barra-marca"
                  style={{
                    width: `${ancho}%`,
                    background: color,
                    // En divergente, las negativas crecen hacia la izquierda
                    // desde el centro; las positivas hacia la derecha.
                    marginLeft: divergente ? (negativo ? `${50 - ancho}%` : '50%') : 0,
                    opacity: activo === null || activo === i ? 1 : 0.45,
                  }}
                />
              </span>

              <span className="barra-valor monto" style={{ color: divergente ? color : undefined }}>
                {fmt(d.valor)}
              </span>
            </>
          );

          const manos = {
            onMouseEnter: () => setActivo(i),
            onMouseLeave: () => setActivo(null),
          };

          return d.href ? (
            <Link key={d.etiqueta} href={d.href} className="barra-fila barra-link" {...manos}>
              {dentro}
            </Link>
          ) : (
            <div key={d.etiqueta} className="barra-fila" {...manos}>
              {dentro}
            </div>
          );
        })}
      </div>

      {activo !== null && datos[activo].nota && (
        <p className="resultado" style={{ marginTop: 6 }}>{datos[activo].nota}</p>
      )}

      {/* Gemela accesible: ningun valor queda solo detras del hover. */}
      <details className="tabla-gemela">
        <summary>Ver los datos como tabla</summary>
        <table>
          <thead><tr><th>Concepto</th><th>Valor</th></tr></thead>
          <tbody>
            {datos.map(d => (
              <tr key={d.etiqueta}>
                <td>{d.etiqueta}</td>
                <td className="monto">{fmt(d.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
