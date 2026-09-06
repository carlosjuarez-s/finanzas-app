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

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="nav" aria-label="Secciones">
      {GRUPOS.map(g => (
        <div className="nav-grupo" key={g.titulo}>
          {/* El titulo del grupo es contexto visual, y para un lector de
              pantalla es la etiqueta de su lista. */}
          <span className="nav-titulo" aria-hidden="true">{g.titulo}</span>
          <ul aria-label={g.titulo}>
            {g.secciones.map(s => (
              <li key={s.href}>
                <Link href={s.href} aria-current={path === s.href ? 'page' : undefined}>
                  {s.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
