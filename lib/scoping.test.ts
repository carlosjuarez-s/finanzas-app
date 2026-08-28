import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que no se pueda olvidar el scoping.
 *
 * El sistema de tipos ya obliga en las escrituras: `usuarioId` es notNull en
 * las doce tablas con dueño, asi que un insert que lo omita no compila. Pero
 * las **lecturas** compilan igual sin filtro, y son justo las que filtran datos
 * de otra persona. Este test lee el codigo fuente y falla si una tabla con
 * dueño se consulta sin nombrar `usuarioId` cerca.
 *
 * Es una heuristica, no un analisis del AST: puede tener un falso positivo si
 * alguien escribe la consulta muy repartida. Ante la duda, prefiere ladrar.
 */

// Las doce con dueño directo. Las hijas —consumos, positions, devoluciones— no
// estan a proposito: se scopean por su padre, y ese padre si tiene que aparecer
// filtrado. Ver `db/schema.ts`.
const CON_DUENIO = [
  'statements', 'salaries', 'portfolioSnapshots', 'monthlyCloses', 'gastos',
  'prestamos', 'goals', 'transacciones', 'eventosActivo', 'conexiones',
  'settings', 'prestamosPersonales',
];

// `usuarios` se consulta por email o para elegir el primero: es la tabla que
// resuelve quien sos, no puede filtrarse por si misma. Cualquier otra excepcion
// se marca con `scoping-ok:` en la consulta, explicando por que.
const EXENTOS = ['lib/usuario.ts'];

function fuentes(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fuentes(p, out);
    else if (/\.tsx?$/.test(e) && !e.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/**
 * Cada `db.…` hasta el `;` que lo cierra, con los comentarios de arriba.
 *
 * El contexto previo importa porque la marca `scoping-ok:` se escribe como
 * comentario ANTES de la consulta, que es donde se lee natural.
 */
function consultas(src: string): { texto: string; contexto: string }[] {
  const out: { texto: string; contexto: string }[] = [];
  let i = src.indexOf('db.');
  while (i !== -1) {
    const fin = src.indexOf(';', i);
    const hasta = fin === -1 ? src.length : fin;
    out.push({
      texto: src.slice(i, hasta),
      contexto: src.slice(Math.max(0, i - 400), hasta),
    });
    i = src.indexOf('db.', hasta);
  }
  return out;
}

test('ninguna tabla con dueño se consulta sin filtrar por usuario', () => {
  const problemas: string[] = [];

  for (const archivo of [...fuentes('lib'), ...fuentes('app'), ...fuentes('db')]) {
    if (EXENTOS.includes(archivo)) continue;
    const src = readFileSync(archivo, 'utf8');

    for (const q of consultas(src)) {
      const tabla = CON_DUENIO.find(t =>
        new RegExp(`\\b(from\\(|db\\.query\\.)${t}\\b`).test(q.texto),
      );
      if (!tabla) continue;
      if (q.texto.includes('usuarioId')) continue;
      // Escape hatch explicito y con motivo, escrito junto a la consulta. Una
      // lista de exenciones en otro archivo se desactualiza y nadie la lee.
      if (q.contexto.includes('scoping-ok:')) continue;
      problemas.push(`${archivo}: consulta ${tabla} sin usuarioId → ${q.texto.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }

  assert.deepEqual(problemas, [], `\n${problemas.join('\n')}\n`);
});

test('el propio detector encuentra una consulta sin scopear', () => {
  // Sin esto, el test de arriba podria pasar por no estar mirando nada.
  const q = consultas('const x = await db.select().from(gastos).where(eq(gastos.periodo, p));');
  assert.equal(q.length, 1);
  assert.ok(new RegExp('\\b(from\\(|db\\.query\\.)gastos\\b').test(q[0].texto));
  assert.ok(!q[0].texto.includes('usuarioId'));

  // Y que la marca explicita efectivamente lo silencie.
  const marcado = consultas('// scoping-ok: motivo\nawait db.select().from(gastos);');
  assert.ok(marcado[0].contexto.includes('scoping-ok:'));
});
