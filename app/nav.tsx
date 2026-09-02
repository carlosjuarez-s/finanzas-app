'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECCIONES = [
  { href: '/', nombre: 'Cierre' },
  { href: '/gastos', nombre: 'Gastos' },
  { href: '/historico', nombre: 'Historico' },
  { href: '/estimacion', nombre: 'Estimacion' },
  { href: '/portafolio', nombre: 'Portafolio' },
  { href: '/metas', nombre: 'Metas' },
  { href: '/conexiones', nombre: 'Conexiones' },
  { href: '/proyeccion', nombre: 'Proyeccion' },
  { href: '/analisis', nombre: 'Analisis' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {SECCIONES.map(s => (
        <Link key={s.href} href={s.href} aria-current={path === s.href ? 'page' : undefined}>
          {s.nombre}
        </Link>
      ))}
    </nav>
  );
}
