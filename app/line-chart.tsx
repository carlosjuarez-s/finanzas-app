'use client';

import { useState } from 'react';
import { fmtArs, fmtUsd, fmtCorto } from '@/lib/formato';

// Orden categorico fijo, validado con el script de la skill de dataviz contra el
// fondo papel: ambar -> azul -> verde da ΔE 17.3 en el peor par adyacente bajo
// daltonismo. El orden importa: ambar y verde juntos caen a ΔE 6.1 y dejan de
// distinguirse. No reordenar sin volver a validar.
export const SERIE_COLORES = ['#B4690E', '#2D5FA8', '#1E7A4F'] as const;

export type Serie = {
  nombre: string;
  valores: number[];
  /**
   * Una serie de REFERENCIA: la linea contra la que se leen las demas, no una
   * mas del grupo. Va punteada y en tinta suave, y **no consume un color
   * categorico** — que es lo que importa, porque `SERIE_COLORES` tiene tres y
   * una cuarta serie normal reusaria el primero.
   */
  referencia?: boolean;
};

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
// El margen derecho tiene que dar para el valor del eje ENTERO ("U$S 4.000,00")
// a la fuente mobile de 24 unidades, o el numero queda cortado a la mitad. 88
// alcanzaba con la fuente chica de escritorio y no con la del telefono.
const PAD = { top: 16, right: 195, bottom: 34, left: 10 };

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

  // Cuantas etiquetas entran sin pisarse.
  //
  // No alcanza con contar puntos: "feb 2026" ocupa el doble que "feb", y en un
  // telefono siete etiquetas largas se superponen hasta quedar ilegibles.
  //
  // Se calcula con la fuente MOBILE (24 unidades del viewBox, que es lo que
  // pone el media query de globals.css) y no con la de escritorio: el SVG no
  // sabe a que ancho lo van a dibujar, y quedarse corto en el telefono es peor
  // que mostrar cuatro etiquetas de mas en la pantalla grande. La tabla gemela
  // sigue teniendo todos los valores.
  const ANCHO_CARACTER = 13;   // ~0.55em sobre 24 unidades
  const anchoEtiqueta = Math.max(...etiquetas.map(e => e.length)) * ANCHO_CARACTER;
  // El +40 es aire entre etiquetas: pegadas se leen como una sola palabra
  // ("feb 2026abr 2026"), que es casi tan malo como que se pisen.
  const caben = Math.max(2, Math.floor(plotW / (anchoEtiqueta + 40)));
  const cadaX = Math.ceil(etiquetas.length / caben);

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

        {/* La primera y la ultima se anclan a su borde: centradas se salen del
            viewBox y el navegador las recorta. */}
        {etiquetas.map((etq, i) => i % cadaX === 0 && (
          <text
            key={etq}
            x={x(i)}
            y={ALTO - 8}
            textAnchor={i === 0 ? 'start' : i >= etiquetas.length - 1 ? 'end' : 'middle'}
            className="eje"
          >
            {etq}
          </text>
        ))}

        {activo !== null && (
          <line x1={x(activo)} x2={x(activo)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--tinta-suave)" strokeWidth="1" />
        )}

        {/* Las de referencia se dibujan al final, no en el orden del array. Con
            los supuestos por defecto "Aportado" y "Dolares" dan exactamente lo
            mismo —los dolares quietos rinden 0— y la linea de base, dibujada
            primero, quedaba tapada por una serie mas gruesa: la leyenda
            anunciaba una linea que no estaba en el grafico. Arriba, el punteado
            sobre la linea llena dice justamente eso: ahi el interes no puso
            nada. sort() es estable, asi que las demas conservan su orden, y en
            la leyenda la referencia sigue apareciendo primera. */}
        {series
          .map((s, si) => ({ s, si }))
          .sort((a, b) => Number(!!a.s.referencia) - Number(!!b.s.referencia))
          .map(({ s, si }) => {
          // Las de referencia no gastan color: se cuentan aparte para que la
          // primera serie real siga siendo el primer color de la paleta.
          const color = s.referencia
            ? 'var(--tinta-suave)'
            : SERIE_COLORES[series.slice(0, si).filter(o => !o.referencia).length % SERIE_COLORES.length];
          const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
          const ultimo = s.valores.length - 1;
          return (
            <g key={s.nombre}>
              {/* La referencia va con halo del color del papel debajo del
                  punteado: casi siempre cae encima de otra serie —con los
                  supuestos por defecto, exactamente encima de "Dolares"— y sin
                  el halo los guiones se mezclan con la linea de abajo y no se
                  leen. Con halo, cada guion recorta lo que tenga atras. */}
              {s.referencia && (
                <path
                  d={d} fill="none" stroke="var(--papel)" strokeWidth="4"
                  strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="butt"
                />
              )}
              <path
                d={d} fill="none" stroke={color}
                strokeWidth={s.referencia ? 1.5 : 2}
                strokeDasharray={s.referencia ? '5 4' : undefined}
                strokeLinejoin="round" strokeLinecap={s.referencia ? 'butt' : 'round'}
              />
              {/* Marcador del extremo con anillo del color del fondo, para que
                  siga legible donde dos series se cruzan. */}
              {/* La referencia no lleva marcador de extremo: no es un dato que
                  uno vaya a leer puntualmente, es una linea de base. */}
              {!s.referencia && (
                <circle cx={x(ultimo)} cy={y(s.valores[ultimo])} r="4" fill={color} stroke="var(--papel)" strokeWidth="2" />
              )}
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
            <span
              className="leyenda-marca"
              data-referencia={s.referencia ? '' : undefined}
              style={{
                background: s.referencia
                  ? 'var(--tinta-suave)'
                  : SERIE_COLORES[series.slice(0, si).filter(o => !o.referencia).length % SERIE_COLORES.length],
              }}
            />
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
