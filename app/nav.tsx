'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECCIONES = [
  { href: '/', nombre: 'Cierre' },
  { href: '/historico', nombre: 'Historico' },
  { href: '/metas', nombre: 'Metas' },
  { href: '/proyeccion', nombre: 'Proyeccion' },
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
