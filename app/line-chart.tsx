'use client';

import { useState } from 'react';
import { fmtArs, fmtUsd, fmtCorto } from '@/lib/formato';

// Orden categorico fijo, validado con el script de la skill de dataviz contra el
// fondo papel: ambar -> azul -> verde da ΔE 17.3 en el peor par adyacente bajo
// daltonismo. El orden importa: ambar y verde juntos caen a ΔE 6.1 y dejan de
// distinguirse. No reordenar sin volver a validar.
export const SERIE_COLORES = ['#B4690E', '#2D5FA8', '#1E7A4F'] as const;

export type Serie = { nombre: string; valores: number[] };

// El formato se elige por nombre y no pasando la funcion: React no puede
// serializar una funcion de un server component a uno de cliente, y el error
// recien aparece al renderizar la pagina, no al compilar.
const FORMATOS = { corto: fmtCorto, ars: fmtArs, usd: fmtUsd } as const;

type Props = {
  etiquetas: string[];
  series: Serie[];
  formato?: keyof typeof FORMATOS;
  /** Etiqueta corta de unidad para la tabla equivalente. */
  unidad?: string;
};

const ALTO = 220;
const ANCHO = 720;
const PAD = { top: 16, right: 88, bottom: 28, left: 8 };

// Ticks en numeros redondos: son los que cargan los valores que no se etiquetan.
function ticks(min: number, max: number, cantidad = 4): number[] {
  if (min === max) return [min];
  const bruto = (max - min) / cantidad;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= bruto) ?? mag * 10;
  const desde = Math.floor(min / paso) * paso;
  const out: number[] = [];
  for (let v = desde; v <= max + paso * 0.001; v += paso) out.push(v);
  return out;
}

export default function LineChart({ etiquetas, series, formato = 'corto', unidad }: Props) {
  const [activo, setActivo] = useState<number | null>(null);
  const fmt = FORMATOS[formato];

  const todos = series.flatMap(s => s.valores);
  const max = Math.max(...todos, 0);
  const min = Math.min(...todos, 0);
  const marcas = ticks(min, max);
  const escalaMin = Math.min(min, ...marcas);
  const escalaMax = Math.max(max, ...marcas);

  const plotW = ANCHO - PAD.left - PAD.right;
  const plotH = ALTO - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (etiquetas.length === 1 ? plotW / 2 : (i / (etiquetas.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - escalaMin) / (escalaMax - escalaMin || 1)) * plotH;

  // Una etiqueta cada tantos puntos: con muchos meses se pisan entre si.
  const cadaX = Math.ceil(etiquetas.length / 8);

  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Evolucion mensual" preserveAspectRatio="xMidYMid meet">
        {/* Grilla: hairline solida, un paso por encima del fondo, recesiva. */}
        {marcas.map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke="var(--linea)" strokeWidth="1" />
            <text x={PAD.left + plotW + 6} y={y(v) + 4} className="eje">{fmt(v)}</text>
          </g>
        ))}

        {etiquetas.map((etq, i) => i % cadaX === 0 && (
          <text key={etq} x={x(i)} y={ALTO - 8} textAnchor="middle" className="eje">{etq}</text>
        ))}

        {activo !== null && (
          <line x1={x(activo)} x2={x(activo)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--tinta-suave)" strokeWidth="1" />
        )}

        {series.map((s, si) => {
          const color = SERIE_COLORES[si % SERIE_COLORES.length];
          const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
          const ultimo = s.valores.length - 1;
          return (
            <g key={s.nombre}>
              <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {/* Marcador del extremo con anillo del color del fondo, para que
                  siga legible donde dos series se cruzan. */}
              <circle cx={x(ultimo)} cy={y(s.valores[ultimo])} r="4" fill={color} stroke="var(--papel)" strokeWidth="2" />
              {activo !== null && (
                <circle cx={x(activo)} cy={y(s.valores[activo])} r="4" fill={color} stroke="var(--papel)" strokeWidth="2" />
              )}
            </g>
          );
        })}

        {/* Zona de hover sobre todo el plot: el objetivo no puede ser el punto. */}
        {etiquetas.map((etq, i) => (
          <rect
            key={etq}
            x={x(i) - plotW / (etiquetas.length * 2 || 1)} y={PAD.top}
            width={plotW / (etiquetas.length || 1)} height={plotH}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
          />
        ))}
      </svg>

      {/* Leyenda: siempre presente con dos o mas series. El texto va en tinta;
          la identidad la da la marca de color al lado, nunca el color del texto. */}
      <div className="leyenda">
        {series.map((s, si) => (
          <span key={s.nombre} className="leyenda-item">
            <span className="leyenda-marca" style={{ background: SERIE_COLORES[si % SERIE_COLORES.length] }} />
            {s.nombre}
            {activo !== null && <span className="monto"> {fmt(s.valores[activo])}</span>}
          </span>
        ))}
        {activo !== null && <span className="eyebrow">{etiquetas[activo]}</span>}
      </div>

      {/* Gemela accesible: ningun valor queda solo detras del hover. */}
      <details className="tabla-gemela">
        <summary>Ver los datos como tabla</summary>
        <table>
          <thead>
            <tr>
              <th>Periodo{unidad ? ` (${unidad})` : ''}</th>
              {series.map(s => <th key={s.nombre}>{s.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {etiquetas.map((etq, i) => (
              <tr key={etq}>
                <td className="monto">{etq}</td>
                {series.map(s => <td key={s.nombre} className="monto">{fmt(s.valores[i])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
