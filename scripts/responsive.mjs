// Chequeo de responsive: mide, no estima.
//
// Esta app se usa desde el celular, asi que "se ve mal en mobile" es un bug como
// cualquier otro y tiene que poder detectarse solo. Busca tres cosas que en un
// telefono arruinan una pantalla y que revisando el CSS a ojo se pasan por alto:
//
//   1. Scroll horizontal: la pagina mas ancha que la ventana. Es el peor, porque
//      desplaza todo el contenido y no siempre se nota en el desarrollo.
//   2. Texto ilegible: por debajo de ~11px efectivos no se lee en un telefono.
//   3. Objetivos tactiles chicos: un boton de menos de 32px es dificil de tocar.
//
// Uso:  node scripts/responsive.mjs [baseUrl] [ruta...]
// Ej:   node scripts/responsive.mjs http://127.0.0.1:3000 / /gastos /historico
//
// Con APP_PASSWORD seteada manda el Basic Auth que exige el middleware.

import { chromium, devices } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const rutas = process.argv.slice(3).length ? process.argv.slice(3) : ['/'];

// Un iPhone SE: si entra aca, entra en cualquier telefono en uso.
const VIEWPORT = { width: 375, height: 667 };
const MIN_FUENTE = 11;
const MIN_TAP = 32;

const password = process.env.APP_PASSWORD;

// PLAYWRIGHT_CHROMIUM permite apuntar a un Chromium ya instalado, para no bajar
// uno nuevo cuando el entorno trae el suyo con otra numeracion de build.
const navegador = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const contexto = await navegador.newContext({
  ...devices['iPhone SE'],
  viewport: VIEWPORT,
  ...(password ? { httpCredentials: { username: 'carlos', password } } : {}),
});

let fallas = 0;

for (const ruta of rutas) {
  const pagina = await contexto.newPage();
  const url = new URL(ruta, base).href;
  // domcontentloaded y no networkidle: el dev server deja abierto el websocket
  // de HMR, asi que la red nunca queda inactiva y la espera expira siempre.
  let motivo = '';
  const respuesta = await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    .catch(e => { motivo = e.message.split('\n')[0]; return null; });
  // Un respiro para que terminen de montar los componentes de cliente.
  await pagina.waitForTimeout(600);

  if (!respuesta || !respuesta.ok()) {
    console.log(`\n✗ ${ruta} — no cargo (${respuesta?.status() ?? motivo})`);
    fallas++;
    await pagina.close();
    continue;
  }

  const informe = await pagina.evaluate(({ MIN_FUENTE, MIN_TAP }) => {
    const anchoVentana = document.documentElement.clientWidth;

    // Solo los que se desbordan por si mismos: si un padre ya desborda, todos
    // sus hijos figuran tambien y el informe se vuelve ilegible.
    const desbordan = [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > anchoVentana + 1;
      })
      .filter(el => {
        const padre = el.parentElement;
        return !padre || padre.getBoundingClientRect().right <= anchoVentana + 1;
      })
      .slice(0, 8)
      .map(el => ({
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        ancho: Math.round(el.getBoundingClientRect().width),
        derecha: Math.round(el.getBoundingClientRect().right),
      }));

    // El texto del SVG escala con el viewBox: hay que medir el tamaño efectivo
    // en pantalla, no el declarado en el CSS.
    const chicos = [...document.querySelectorAll('body *')]
      .filter(el => el.children.length === 0 && el.textContent?.trim())
      .map(el => {
        const svg = el.ownerSVGElement ?? (el.tagName.toLowerCase() === 'text' ? el.closest('svg') : null);
        let px = parseFloat(getComputedStyle(el).fontSize);
        if (svg) {
          const vb = svg.viewBox?.baseVal;
          if (vb?.width) px *= svg.getBoundingClientRect().width / vb.width;
        }
        return { texto: el.textContent.trim().slice(0, 24), px: Math.round(px * 10) / 10 };
      })
      .filter(x => x.px > 0 && x.px < MIN_FUENTE)
      .slice(0, 6);

    // Lo que se toca no siempre es el elemento medido: en una libreria de
    // componentes, el <input> real vive dentro de un wrapper mas grande que es
    // el que recibe el toque. Medir el input daba falsos positivos.
    const WRAPPERS = '.ant-select, .ant-input-number, .ant-picker, .ant-input-affix-wrapper, label';
    const areaTactil = el => (el.closest(WRAPPERS) ?? el).getBoundingClientRect();

    const tapChicos = [...document.querySelectorAll('button, a, input, select, [role="button"]')]
      .map(el => ({ el, r: areaTactil(el) }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < MIN_TAP)
      .slice(0, 6)
      .map(({ el, r }) => ({
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/)[0] : ''),
        texto: (el.textContent ?? '').trim().slice(0, 20),
        alto: Math.round(r.height),
      }));

    return {
      anchoVentana,
      scrollWidth: document.documentElement.scrollWidth,
      desbordan, chicos, tapChicos,
    };
  }, { MIN_FUENTE, MIN_TAP });

  const scrollHorizontal = informe.scrollWidth > informe.anchoVentana + 1;
  const problemas = scrollHorizontal || informe.chicos.length || informe.tapChicos.length;

  console.log(`\n${problemas ? '✗' : '✓'} ${ruta}`);
  if (scrollHorizontal) {
    console.log(`   scroll horizontal: la pagina mide ${informe.scrollWidth}px en una ventana de ${informe.anchoVentana}px`);
    for (const d of informe.desbordan) {
      console.log(`     · ${d.sel} — ${d.ancho}px de ancho, termina en ${d.derecha}px`);
    }
  }
  for (const c of informe.chicos) {
    console.log(`   texto a ${c.px}px (minimo ${MIN_FUENTE}): "${c.texto}"`);
  }
  for (const t of informe.tapChicos) {
    console.log(`   objetivo tactil de ${t.alto}px (minimo ${MIN_TAP}): <${t.sel}> "${t.texto}"`);
  }
  if (problemas) fallas++;

  await pagina.close();
}

await navegador.close();
console.log(fallas ? `\n${fallas} pantalla(s) con problemas en mobile.` : '\nTodo entra bien en mobile.');
process.exit(fallas ? 1 : 0);
