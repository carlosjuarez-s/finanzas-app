import { fmtArs, fmtUsd } from '@/lib/formato';

/**
 * Un monto con signo, legible sin ver el color.
 *
 * Antes un monto negativo se distinguia solo por ser ocre: quien no distingue
 * ocre de gris veia el mismo numero. Ahora el signo va SIEMPRE explicito —el
 * "+" tambien, que es el que se omite por costumbre— y hay una flecha con su
 * texto para lectores de pantalla.
 *
 * El color se queda: refuerza, pero ya no es lo unico que lo dice.
 */
export default function Monto({ valor, moneda = 'ARS', tamano }: {
  valor: number | null;
  moneda?: 'ARS' | 'USD';
  tamano?: number;
}) {
  if (valor === null || !Number.isFinite(valor)) {
    return <span className="monto" style={{ fontSize: tamano }}>—</span>;
  }

  const fmt = moneda === 'USD' ? fmtUsd : fmtArs;
  const negativo = valor < 0;
  const cero = valor === 0;

  return (
    <span
      className="monto"
      style={{ fontSize: tamano, color: cero ? undefined : negativo ? 'var(--alerta)' : 'var(--dolar)' }}
    >
      {!cero && (
        <span className="signo" aria-hidden="true">{negativo ? '▾' : '▴'}</span>
      )}
      {/* El signo va en el texto, no solo en el color ni solo en la flecha. */}
      {!cero && !negativo && '+'}
      {fmt(valor)}
      {!cero && <span className="sr">{negativo ? ' (negativo)' : ' (positivo)'}</span>}
    </span>
  );
}
