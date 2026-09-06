'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Nueve secciones sin agrupar son nueve palabras sueltas: hay que leerlas todas
// para encontrar una. Agrupadas por intencion son tres grupos de tres, y uno
// sabe en cual buscar antes de leer.
//
// Los titulos son cortos porque compiten por el mismo renglon que los links:
// "Mirar atras" a 11px empujaba "Analisis" a un renglon nuevo.
//
// Tres grupos de tres, y no dos de cuatro: cada grupo entra en un renglon del
// telefono. Uno de cuatro se parte y agrega un renglon entero al nav, que ya
// ocupa demasiado antes de que empiece el contenido.
//
// El orden dentro de cada grupo es por frecuencia de uso, no alfabetico.
const GRUPOS = [
  {
    titulo: 'Mes',
    secciones: [
      { href: '/', nombre: 'Cierre' },
      { href: '/gastos', nombre: 'Gastos' },
      { href: '/estimacion', nombre: 'Estimacion' },
    ],
  },
  {
    titulo: 'Invertido',
    secciones: [
      { href: '/portafolio', nombre: 'Portafolio' },
      { href: '/conexiones', nombre: 'Conexiones' },
      { href: '/metas', nombre: 'Metas' },
    ],
  },
  {
    titulo: 'Panorama',
    secciones: [
      { href: '/historico', nombre: 'Historico' },
      { href: '/proyeccion', nombre: 'Proyeccion' },
      { href: '/analisis', nombre: 'Analisis' },
    ],
  },
];

// Los cuatro que se usan a diario. En el telefono van fijos abajo, al alcance
// del pulgar; el resto queda arriba, donde se llega cuando se lo busca.
const PULGAR = ['/', '/gastos', '/portafolio', '/estimacion'];

const ICONO: Record<string, string> = {
  '/': 'M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1z',
  '/gastos': 'M3 6h14v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 6l1.5-2h11L17 6M7 10h6',
  '/portafolio': 'M4 15V9m4 6V5m4 10v-4m4 4V7',
  '/estimacion': 'M4 14l4-4 3 3 5-6M13 7h3v3',
};

export default function Nav() {
  const path = usePathname();
  const abajo = GRUPOS.flatMap(g => g.secciones).filter(s => PULGAR.includes(s.href));

  return (
    <>
    <nav className="nav" aria-label="Secciones">
      {GRUPOS.map(g => (
        <div className="nav-grupo" key={g.titulo}>
          {/* El titulo del grupo es contexto visual, y para un lector de
              pantalla es la etiqueta de su lista. */}
          <span className="nav-titulo" aria-hidden="true">{g.titulo}</span>
          <ul aria-label={g.titulo}>
            {g.secciones.map(s => (
              <li key={s.href} data-pulgar={PULGAR.includes(s.href) ? '' : undefined}>
                <Link href={s.href} aria-current={path === s.href ? 'page' : undefined}>
                  {s.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>

    {/* Barra del pulgar. Solo en el telefono: en una pantalla grande el nav de
        arriba ya esta a la vista y una barra fija abajo seria un estorbo.
        Los iconos van CON su etiqueta: un icono solo obliga a adivinar, y en
        finanzas adivinar sale caro. */}
    <nav className="pulgar" aria-label="Accesos rapidos">
      {abajo.map(s => (
        <Link key={s.href} href={s.href} aria-current={path === s.href ? 'page' : undefined}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d={ICONO[s.href]} fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {s.nombre}
        </Link>
      ))}
    </nav>
    </>
  );
}
