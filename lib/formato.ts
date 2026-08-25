// Formato argentino en un solo lugar: las paginas mostraban el mismo monto con
// distinto separador segun quien lo escribiera.
const num = (n: number, dec = 2) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const fmtArs = (n: number) => '$ ' + num(n);
export const fmtUsd = (n: number) => 'U$S ' + num(n);
export const fmtPct = (n: number) => num(n, 1) + '%';

// Para ejes: los miles llenan el eje y no aportan nada a esa escala.
export const fmtCorto = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (abs >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(Math.round(n));
};

// "2026-09" -> "sep 2026". El YYYY-MM crudo es dificil de leer en un eje.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtPeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${MESES[m - 1] ?? m} ${y}`;
}
