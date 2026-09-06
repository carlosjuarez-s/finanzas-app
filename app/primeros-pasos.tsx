import Link from 'next/link';
import type { Arranque } from '@/lib/primeros-pasos';

/**
 * Los primeros pasos, solo hasta que sobran.
 *
 * Desaparece sola cuando estan todos los que no son opcionales: un panel de
 * bienvenida que sigue ahi el sexto mes es ruido, no ayuda.
 */
export default function PrimerosPasos({ arranque }: { arranque: Arranque }) {
  const { pasos, vacia, completos } = arranque;

  // Los opcionales no cuentan para decidir si ya no hace falta.
  const obligatorios = pasos.filter(p => p.id !== 'inversiones');
  if (obligatorios.every(p => p.hecho)) return null;

  return (
    <section className="arranque">
      <h2>
        {vacia ? 'Empezá por acá' : 'Te falta poco'}
        <span className="chip">{completos} de {pasos.length}</span>
      </h2>

      <p className="resultado">
        {vacia
          ? 'La app arma el cierre a partir de lo que le cargues. Estos pasos están en orden: ' +
            'cada uno hace posible el siguiente.'
          : 'Con esto queda todo funcionando.'}
      </p>

      <ol className="pasos">
        {pasos.map(p => (
          <li key={p.id} className={p.hecho ? 'listo' : undefined}>
            {/* El estado va en el simbolo y en el texto, no solo en el color:
                un tilde verde y un circulo vacio se distinguen sin ver color. */}
            <span className="marca" aria-hidden="true">{p.hecho ? '✓' : '○'}</span>
            <span>
              <Link href={p.href}>{p.titulo}</Link>
              <span className="sr">{p.hecho ? ' (hecho)' : ' (pendiente)'}</span>
              <span className="resultado" style={{ display: 'block' }}>{p.detalle}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
