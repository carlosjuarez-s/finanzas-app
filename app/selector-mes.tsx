'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Select } from 'antd';
import { fmtPeriodo } from '@/lib/formato';
import { vecino } from '@/lib/periodos';

/**
 * Cambiar de mes.
 *
 * Dos formas a proposito: las flechas para recorrer meses seguidos, que es lo
 * que uno hace comparando; la lista para saltar a uno lejano.
 *
 * Cambia SOLO el parametro `periodo`: lo que haya que conservar —el filtro por
 * categoria, por ejemplo— llega en `conservar`. Se pasa desde el servidor, que
 * ya lo tiene, en vez de leerlo con `useSearchParams`: ese hook obliga a
 * envolver el componente en un Suspense y hace fallar el build de cualquier
 * pagina que no sea dinamica.
 */
export default function SelectorMes({ periodos, actual, conservar }: {
  periodos: string[];
  actual: string;
  conservar?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const path = usePathname();

  const irA = (periodo: string) => {
    const q = new URLSearchParams({ periodo });
    for (const [k, v] of Object.entries(conservar ?? {})) if (v) q.set(k, v);
    return `${path}?${q.toString()}`;
  };

  const anterior = vecino(periodos, actual, 'anterior');
  const siguiente = vecino(periodos, actual, 'siguiente');

  return (
    <div className="selector-mes">
      <Flecha href={anterior && irA(anterior)} hacia="anterior" />
      <Select
        value={actual}
        onChange={p => router.push(irA(p))}
        options={periodos.map(p => ({ value: p, label: fmtPeriodo(p) }))}
        style={{ minWidth: 132 }}
        aria-label="Mes"
        showSearch
        optionFilterProp="label"
      />
      <Flecha href={siguiente && irA(siguiente)} hacia="siguiente" />
      <span className="resultado" style={{ fontSize: 12 }}>
        {periodos.length} {periodos.length === 1 ? 'mes' : 'meses'} con datos
      </span>
    </div>
  );
}

// En la punta no desaparece, queda deshabilitada: un control que se esfuma
// mueve el resto de la fila justo cuando estas por tocarlo.
function Flecha({ href, hacia }: { href: string | null | undefined; hacia: 'anterior' | 'siguiente' }) {
  const etiqueta = hacia === 'anterior' ? 'Mes anterior' : 'Mes siguiente';
  const signo = hacia === 'anterior' ? '‹' : '›';

  if (!href) {
    return <span className="flecha-mes" aria-hidden="true" data-inactiva="">{signo}</span>;
  }
  return (
    <Link className="flecha-mes" href={href} aria-label={etiqueta} title={etiqueta}>
      {signo}
    </Link>
  );
}
