// Formato argentino en un solo lugar: las paginas mostraban el mismo monto con
// distinto separador segun quien lo escribiera.
const num = (n: number, dec = 2) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const fmtArs = (n: number) => '$ ' + num(n);
export const fmtUsd = (n: number) => 'U$S ' + num(n);
export const fmtPct = (n: number) => num(n, 1) + '%';

// Sin centavos. En una estimacion los centavos son ruido, y en una tabla de
// varias columnas son la diferencia entre que entre en un telefono o no.
export const fmtArsEntero = (n: number) => '$ ' + num(n, 0);
export const fmtUsdEntero = (n: number) => 'U$S ' + num(n, 0);

// Sin simbolo: para tablas donde la moneda ya esta en el encabezado y repetirla
// en cada celda es lo que las saca de la pantalla.
export const fmtNumEntero = (n: number) => num(n, 0);

// Un decimal y sin unidad: "4,3 años". toFixed(1) escribe "4.3", y en es-AR el
// punto es el separador de miles, no el decimal.
export const fmtNum1 = (n: number) => num(n, 1);

// Para ejes: los miles llenan el eje y no aportan nada a esa escala.
export const fmtCorto = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (abs >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(Math.round(n));
};

// La forma de un periodo, en un solo lugar: estaba copiada en tres modulos y
// una copia que se corrige sola es una copia que se desincroniza.
export const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

export const periodoValido = (v: unknown): v is string =>
  typeof v === 'string' && PERIODO.test(v);

// "2026-09" -> "sep 2026". El YYYY-MM crudo es dificil de leer en un eje.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtPeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${MESES[m - 1] ?? m} ${y}`;
}
