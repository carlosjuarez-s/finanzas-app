// Contraste WCAG de los tokens de la app. Se mide, no se estima.
//
// Uso: node scripts/contraste.mjs
//
// El caso que justifica esto: --tinta-suave estaba en 4.46:1 y --alerta en
// 3.78:1. Los dos parecian bien a ojo. El primero es el color de cada nota y
// cada etiqueta de la app; el segundo, el que marca los problemas.

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contraste = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Los pares que llevan TEXTO. --linea no esta: es solo borde.
export const PARES = [
  ['claro  tinta',       '#22262B', '#F5F2EA'],
  ['claro  tinta-suave', '#6A6F75', '#F5F2EA'],
  ['claro  peso',        '#2D5FA8', '#F5F2EA'],
  ['claro  dolar',       '#1E7A4F', '#F5F2EA'],
  ['claro  alerta',      '#A25E0D', '#F5F2EA'],
  ['claro  rotulo',      '#7D6440', '#F5F2EA'],
  ['claro  rotulo/alto', '#7D6440', '#FFFDF7'],
  ['oscuro tinta',       '#E9E5DB', '#1A1D21'],
  ['oscuro tinta-suave', '#7F858C', '#1A1D21'],
  ['oscuro peso',        '#3E83E8', '#1A1D21'],
  ['oscuro dolar',       '#259661', '#1A1D21'],
  ['oscuro alerta',      '#C1700F', '#1A1D21'],
  ['oscuro rotulo',      '#BFA271', '#1A1D21'],
  ['oscuro rotulo/alto', '#BFA271', '#21252A'],
];

export const MINIMO = 4.5;   // WCAG AA para texto normal

if (import.meta.url === `file://${process.argv[1]}`) {
  let fallas = 0;
  for (const [nombre, fg, bg] of PARES) {
    const r = contraste(fg, bg);
    const ok = r >= MINIMO;
    if (!ok) fallas++;
    console.log(`  ${ok ? '✓' : '✗'} ${nombre.padEnd(20)} ${fg} sobre ${bg}  ${r.toFixed(2)}:1`);
  }
  console.log(fallas ? `\n${fallas} par(es) por debajo de ${MINIMO}:1` : `\nTodo pasa AA (${MINIMO}:1).`);
  process.exit(fallas ? 1 : 0);
}
