/**
 * La planilla de Finanzas, interpretada.
 *
 * Es una hoja real de una persona real: 542 filas, tres años, hecha a mano y
 * con las inconsistencias que eso trae —montos guardados como texto, signos al
 * reves, filas sin monto, y un "Mes" que dice "Agosto" sin decir de que año.
 *
 * Este modulo la traduce al modelo de la app **sin inventar un solo numero**.
 * Todo lo que corrige queda anotado en `rectificaciones`, y todo lo que no
 * puede traducir queda en `descartes` con el motivo. Las dos listas se le
 * muestran a la persona: un import silencioso que "arregla" datos es peor que
 * uno que falla, porque el error queda adentro y ya nadie lo busca.
 */

export type Cruda = {
  fila: number;
  nombre: string;
  tipo: string;
  subtipo: string;
  mes: string;
  status: string;
  costo: unknown;
  desc: string;
  /** Fecha de vencimiento, cuando la hay. Sirve para verificar el año. */
  anioVencimiento: number | null;
};

export type Nota = { fila: number; que: string; detalle: string };

export type SueldoImportado = { periodo: string; netoArs: number; netoUsd: number; tipoCambio: number | null };
export type ResumenImportado = { periodo: string; card: string; totalArs: number; pagado: boolean };
export type GastoImportado = {
  periodo: string; concepto: string; categoria: string; montoArs: number; pagado: boolean;
};

/** Plata que entro y no es sueldo: los "Reingreso" de la planilla. */
export type IngresoImportado = {
  periodo: string; concepto: string; tipo: 'REINTEGRO' | 'EXTRA'; montoArs: number;
};

export type Interpretacion = {
  sueldos: SueldoImportado[];
  resumenes: ResumenImportado[];
  gastos: GastoImportado[];
  ingresos: IngresoImportado[];
  rectificaciones: Nota[];
  descartes: Nota[];
  periodos: string[];
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Indice 1-12 del nombre del mes, o null si no es un mes. */
export function indiceDeMes(nombre: string): number | null {
  const i = MESES.indexOf(sinAcentos(nombre));
  return i === -1 ? null : i + 1;
}

/**
 * El año de cada fila.
 *
 * La planilla no lo dice. Lo que si dice, y es suficiente, es que las filas
 * estan en orden cronologico y que **un bloque de Enero detras de uno de
 * Diciembre es un año nuevo**. Eso alcanza porque la hoja no repite Enero
 * dentro de un mismo año.
 *
 * Una regla asi puede fallar en otra planilla, y por eso no se aplica a ciegas:
 * `verificar` contrasta el resultado contra los vencimientos que si traen año y
 * contra el mes en que estamos. Si alguna de las dos no cierra, el import se
 * detiene en vez de escribir tres años de datos corridos.
 */
export function asignarAnios(filas: Cruda[], anioInicial: number): (number | null)[] {
  let anio = anioInicial;
  let mesPrevio: number | null = null;
  return filas.map(f => {
    const m = indiceDeMes(f.mes);
    if (m === null) return null;
    // Enero detras de Diciembre: cambio de año. Se compara contra el mes de la
    // fila anterior con mes valido, no contra la fila anterior a secas.
    if (m === 1 && mesPrevio === 12) anio++;
    mesPrevio = m;
    return anio;
  });
}

export type Verificacion = { ok: true } | { ok: false; motivo: string };

/**
 * Contrasta los años inferidos contra lo que la planilla si afirma.
 *
 * Dos anclas independientes: los vencimientos con año explicito, y el hecho de
 * que la ultima fila tiene que caer en el mes en curso —una planilla que se
 * lleva al dia termina en el mes actual, no seis meses atras ni tres adelante.
 */
export function verificar(
  filas: Cruda[], anios: (number | null)[], hoy: { anio: number; mes: number },
): Verificacion {
  for (let i = 0; i < filas.length; i++) {
    const esperado = anios[i];
    const real = filas[i].anioVencimiento;
    if (esperado === null || real === null) continue;
    if (esperado !== real) {
      return {
        ok: false,
        motivo: `La fila ${filas[i].fila} quedo en ${esperado} pero su vencimiento dice ${real}. ` +
          'La inferencia de años no cierra con las fechas de la planilla.',
      };
    }
  }

  // Ultimo mes con datos
  let ultimo: { anio: number; mes: number } | null = null;
  for (let i = filas.length - 1; i >= 0; i--) {
    const m = indiceDeMes(filas[i].mes);
    if (m !== null && anios[i] !== null) { ultimo = { anio: anios[i]!, mes: m }; break; }
  }
  if (!ultimo) return { ok: false, motivo: 'Ninguna fila tiene un mes reconocible.' };

  const distancia = (ultimo.anio - hoy.anio) * 12 + (ultimo.mes - hoy.mes);
  if (Math.abs(distancia) > 1) {
    return {
      ok: false,
      motivo: `La ultima fila queda en ${ultimo.anio}-${String(ultimo.mes).padStart(2, '0')}, ` +
        `a ${distancia} meses de hoy. Una planilla al dia termina en el mes en curso: ` +
        'el año inicial debe estar mal.',
    };
  }
  return { ok: true };
}

/** Un monto de la planilla: puede venir numero, texto, o no venir. */
export function monto(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const limpio = v.replace(/[$\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number(limpio);
    return Number.isFinite(n) && limpio !== '' ? n : null;
  }
  return null;
}

/** Los nombres que son sueldo. El resto de los ingresos NO lo es. */
const SALARIAL = /^(salario|sueldo cambio en dolares|extra salario usd|aguinaldo)/;
export const esSalarial = (nombre: string) => SALARIAL.test(sinAcentos(nombre));

/** "Dolar hoy: 1235" en la descripcion: la planilla dice a que cambio fue. */
export function tipoCambioDeLaNota(desc: string): number | null {
  const m = /d[oó]lar\s+hoy\s*:?\s*([\d.,]+)/i.exec(desc);
  if (!m) return null;
  const n = monto(m[1]);
  return n !== null && n > 0 ? n : null;
}

// La categoria sale del nombre de la fila: la planilla no tiene una columna de
// rubro, tiene nombres estables que se repiten mes a mes.
const RUBROS: [RegExp, string][] = [
  [/^alquiler/, 'Alquiler'],
  [/^(super|supermercado)/, 'Supermercado y comida'],
  [/^(gas|agua|luz|internet|expensas)/, 'Servicios'],
  [/^(natacion|gym|gimnasio|pilates)/, 'Salud y deporte'],
  [/prestamo|^mercadopago$|^mercado pago$/, 'Cuotas'],
  [/^(cuota de terreno|compra usdt|compra cedears|inversion|ahorro usd|varsovia|entrada dpto|deposito)/, 'Inversiones'],
  [/^(sembrador|comision)/, 'Comisiones bancarias'],
];

export const CATEGORIA_INVERSION = 'Inversiones';

export function categoriaDe(nombre: string): string {
  const n = sinAcentos(nombre);
  for (const [re, cat] of RUBROS) if (re.test(n)) return cat;
  return 'Otros';
}

/** "Pagado" es lo unico que cuenta como pagado. "Pendiente" y "No iniciado" no. */
export const estaPagado = (status: string) => sinAcentos(status) === 'pagado';

const periodoDe = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`;

/**
 * Traduce la planilla al modelo de la app.
 *
 * Las decisiones que toma, todas discutibles y por eso escritas:
 *
 * - **El signo lo decide el Tipo, no la celda.** La planilla tiene egresos en
 *   positivo y un ingreso en negativo: son errores de tipeo, no movimientos al
 *   reves. Se usa el valor absoluto y se anota la correccion.
 * - **Un "Aguinaldo" en positivo dentro de Egreso es un ingreso.** El nombre
 *   manda sobre la columna cuando los dos se contradicen y uno de los dos es
 *   inequivoco.
 * - **Solo el sueldo es sueldo.** Un reintegro de la tarjeta no es ingreso
 *   salarial: entra como gasto negativo, que baja el gasto del mes sin inflar
 *   el recibo. Es la unica forma honesta con el modelo actual, y deja la tasa
 *   de ahorro bien.
 * - **Las tarjetas son resumenes, no gastos sueltos.** Es lo que son, y el
 *   cierre ya sabe sumarlos. El costo: sin el detalle del PDF no aportan al
 *   desglose por categoria.
 */
/**
 * Meses cargados dos veces.
 *
 * En la planilla, mayo 2026 aparece repetido: dos alquileres, dos "Super
 * Mensual", dos sueldos. Sumarlos da un mes con el doble de ingreso y el doble
 * de gasto, y ese mes ensucia el promedio de todos los demas.
 *
 * La señal es el sueldo: una persona cobra **un** sueldo por mes. Si un periodo
 * trae dos filas llamadas "Salario", el bloque esta duplicado.
 *
 * Se queda el ultimo, con el mismo criterio que usa el resto de la app: lo mas
 * reciente le gana a lo anterior, porque una fila escrita despues suele ser la
 * correccion de la de antes. Las filas descartadas se listan una por una: es
 * una decision discutible y quien mira tiene que poder revisarla.
 */
export function bloquesDuplicados(filas: Cruda[], anios: (number | null)[]): Set<number> {
  const porPeriodo = new Map<string, number[]>();
  filas.forEach((f, i) => {
    const anio = anios[i], mes = indiceDeMes(f.mes);
    if (anio === null || mes === null) return;
    const p = periodoDe(anio, mes);
    porPeriodo.set(p, [...(porPeriodo.get(p) ?? []), i]);
  });

  const fuera = new Set<number>();
  for (const indices of porPeriodo.values()) {
    const sueldos = indices.filter(i => sinAcentos(filas[i].nombre) === 'salario');
    if (sueldos.length < 2) continue;
    // El bloque termina en su grupo de filas de sueldo, que son varias:
    // "Salario" y despues "Sueldo Cambio en Dolares". Cortar en la fila
    // "Salario" dejaba viva la de dolares del bloque viejo, y ese mes quedaba
    // con medio sueldo de mas.
    let corte = indices.indexOf(sueldos[sueldos.length - 2]);
    while (corte + 1 < indices.length && esSalarial(filas[indices[corte + 1]].nombre)) corte++;
    for (const i of indices.slice(0, corte + 1)) fuera.add(i);
  }
  return fuera;
}

export function interpretar(
  filas: Cruda[], anios: (number | null)[],
): Interpretacion {
  const repetidas = bloquesDuplicados(filas, anios);
  const rectificaciones: Nota[] = [];
  const descartes: Nota[] = [];
  const resumenes: ResumenImportado[] = [];
  const gastos: GastoImportado[] = [];
  const entradas: IngresoImportado[] = [];

  // El sueldo de un mes puede venir en varias filas (Salario + Salario USD +
  // Aguinaldo): se acumulan y se escribe una sola fila por periodo.
  const porMes = new Map<string, { ars: number; usd: number; tc: number | null }>();

  filas.forEach((f, i) => {
    const anio = anios[i];
    const mes = indiceDeMes(f.mes);
    if (anio === null || mes === null) {
      descartes.push({ fila: f.fila, que: f.nombre || '(sin nombre)', detalle: 'No tiene un mes reconocible.' });
      return;
    }
    const periodo = periodoDe(anio, mes);

    if (repetidas.has(i)) {
      descartes.push({
        fila: f.fila, que: f.nombre,
        detalle: `${periodo} esta cargado dos veces en la planilla (dos filas "Salario"). ` +
          'Se importa el ultimo bloque y este queda afuera.',
      });
      return;
    }

    const crudo = monto(f.costo);
    if (crudo === null) {
      descartes.push({ fila: f.fila, que: f.nombre || '(sin nombre)', detalle: `Sin monto, en ${periodo}.` });
      return;
    }
    if (typeof f.costo === 'string') {
      rectificaciones.push({ fila: f.fila, que: f.nombre, detalle: `El monto estaba como texto ("${f.costo}"): se leyo ${crudo}.` });
    }
    if (crudo === 0) {
      descartes.push({ fila: f.fila, que: f.nombre, detalle: `Monto cero en ${periodo}.` });
      return;
    }

    const tipo = sinAcentos(f.tipo);
    const abs = Math.abs(crudo);
    const pagado = estaPagado(f.status);

    // Un "Aguinaldo" positivo marcado como Egreso es un ingreso mal tipeado:
    // el nombre no admite otra lectura.
    const esAguinaldoMalTipeado = tipo === 'egreso' && crudo > 0 && /aguinaldo/.test(sinAcentos(f.nombre));
    if (esAguinaldoMalTipeado) {
      rectificaciones.push({ fila: f.fila, que: f.nombre, detalle: `Figuraba como Egreso con monto positivo en ${periodo}: se toma como ingreso.` });
    }

    const esIngreso = tipo === 'ingreso' || tipo === 'reingreso' || esAguinaldoMalTipeado;

    if (!esIngreso && crudo > 0) {
      rectificaciones.push({ fila: f.fila, que: f.nombre, detalle: `Egreso con monto positivo (${crudo}) en ${periodo}: se toma como egreso.` });
    }
    // Un ingreso con monto negativo se contradice a si mismo, y el nombre no
    // alcanza para saber de que lado esta: "Pago estadia en Visa" puede ser un
    // pago que hiciste o uno que te devolvieron, y la diferencia es del doble
    // del monto. Se descarta y se pregunta, no se elige.
    if (esIngreso && crudo < 0 && !esAguinaldoMalTipeado) {
      descartes.push({
        fila: f.fila, que: f.nombre,
        detalle: `Figura como ${f.tipo} pero con monto negativo (${crudo}) en ${periodo}. ` +
          'No se puede saber si entro o salio: hace falta que lo aclares.',
      });
      return;
    }

    if (esIngreso) {
      if (esSalarial(f.nombre) || esAguinaldoMalTipeado) {
        const acc = porMes.get(periodo) ?? { ars: 0, usd: 0, tc: null };
        const tc = tipoCambioDeLaNota(f.desc);
        // La planilla anota "Dolar hoy: N" en la fila del sueldo en dolares. Con
        // eso se recupera el reparto entre monedas sin inventar ninguna
        // cotizacion: el total en pesos queda identico.
        if (tc && /usd|dolar/.test(sinAcentos(f.nombre))) {
          acc.usd += abs / tc;
          acc.tc = tc;
          rectificaciones.push({ fila: f.fila, que: f.nombre, detalle: `La planilla dice "dolar hoy: ${tc}": ${abs} pesos se guardan como U$S ${(abs / tc).toFixed(2)}.` });
        } else {
          acc.ars += abs;
        }
        porMes.set(periodo, acc);
      } else {
        // Reintegros y otros ingresos no salariales. Van a su propia tabla: no
        // son sueldo, y meterlos como gasto negativo —que fue el parche de la
        // primera version— ensuciaba el desglose por categoria.
        entradas.push({
          periodo, concepto: f.nombre,
          tipo: tipo === 'reingreso' ? 'REINTEGRO' : 'EXTRA',
          montoArs: abs,
        });
      }
      return;
    }

    if (sinAcentos(f.subtipo) === 'tarjeta') {
      resumenes.push({ periodo, card: f.nombre, totalArs: abs, pagado });
      return;
    }

    gastos.push({ periodo, concepto: f.nombre, categoria: categoriaDe(f.nombre), montoArs: abs, pagado });
  });

  const sueldos: SueldoImportado[] = [...porMes.entries()]
    .map(([periodo, v]) => ({ periodo, netoArs: redondear(v.ars), netoUsd: redondear(v.usd), tipoCambio: v.tc }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const periodos = [...new Set([
    ...sueldos.map(s => s.periodo),
    ...resumenes.map(r => r.periodo),
    ...gastos.map(g => g.periodo),
    ...entradas.map(i => i.periodo),
  ])].sort();

  return { sueldos, resumenes, gastos, ingresos: entradas, rectificaciones, descartes, periodos };
}

// Dos decimales: la columna de la base es numeric(12,2) y guardar mas seria
// perderlos en silencio al insertar.
const redondear = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// SQL
//
// El import no escribe en la base: emite SQL para pegar en Neon, igual que las
// migraciones. Lo que toca datos reales lo corre una persona mirando lo que
// corre.
//
// Todo lleva un `file_id` derivado del contenido, y todo va con ON CONFLICT DO
// NOTHING contra los indices unicos que ya existen. Correrlo dos veces no
// duplica una sola fila, y correrlo sobre una base que ya tiene datos no pisa
// nada: lo que ya esta, gana.

const comilla = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (n: number) => n.toFixed(2);

/** Un id estable y legible, derivado del contenido. Correrlo dos veces no duplica. */
export function idDeImport(clase: string, periodo: string, detalle: string, orden: number): string {
  const slug = sinAcentos(detalle).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `planilla:${clase}:${periodo}:${slug}:${orden}`;
}

export function aSql(r: Interpretacion, usuarioId: string): string {
  const u = comilla(usuarioId);
  const l: string[] = [];

  l.push('-- Import de la planilla Finanzas.');
  l.push('-- Idempotente: ON CONFLICT DO NOTHING contra los unicos que ya existen.');
  l.push('-- Lo que ya este cargado gana; esto solo agrega lo que falta.');
  l.push('BEGIN;');
  l.push('');

  l.push('-- Categorias nuevas que este import necesita, sin borrar las tuyas.');
  l.push(`INSERT INTO "settings" ("usuario_id", "clave", "valor")`);
  l.push(`VALUES (${u}, 'categorias', ${comilla(JSON.stringify([...CATEGORIAS_DEL_IMPORT]))}::jsonb)`);
  // Agrega solo las que faltan, al final y sin reordenar las que ya elegiste.
  l.push(`ON CONFLICT ("usuario_id", "clave") DO UPDATE SET "valor" = "settings"."valor" || (`);
  l.push(`  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)`);
  l.push(`  FROM jsonb_array_elements(EXCLUDED."valor") x`);
  l.push(`  WHERE NOT ("settings"."valor" @> jsonb_build_array(x)));`);
  l.push('');

  if (r.sueldos.length) {
    l.push(`-- ${r.sueldos.length} meses de sueldo.`);
    l.push('INSERT INTO "salaries" ("id", "usuario_id", "periodo", "neto_ars", "neto_usd", "file_id", "corregido") VALUES');
    l.push(r.sueldos.map(s => `  (${comilla(idDeImport('sueldo', s.periodo, 'neto', 0))}, ${u}, ${comilla(s.periodo)}, ${num(s.netoArs)}, ${num(s.netoUsd)}, ${comilla(`planilla:${s.periodo}`)}, true)`).join(',\n'));
    l.push('ON CONFLICT ("usuario_id", "periodo") DO NOTHING;');
    l.push('');
  }

  // El tipo de cambio de los meses cuyo sueldo quedo partido en dos monedas.
  // Sin esto, el cierre consolidaria un mes de 2024 con el dolar de hoy y el
  // ingreso de ese mes se iria al doble.
  const conTc = r.sueldos.filter(s => s.tipoCambio !== null && s.netoUsd > 0);
  if (conTc.length) {
    l.push(`-- El tipo de cambio de ${conTc.length} meses, el que anota la planilla.`);
    l.push('-- Las demas cifras van en cero: el cierre las recalcula y respeta este valor.');
    l.push('INSERT INTO "monthly_closes"');
    l.push('  ("id", "usuario_id", "periodo", "ingreso_ars", "ingreso_usd", "gasto_ars", "gasto_usd", "tipo_cambio", "percep_ars", "ahorro_ars", "por_categoria") VALUES');
    l.push(conTc.map(s => `  (${comilla(idDeImport('cierre', s.periodo, 'tc', 0))}, ${u}, ${comilla(s.periodo)}, 0, 0, 0, 0, ${s.tipoCambio!.toFixed(4)}, 0, 0, '{}'::jsonb)`).join(',\n'));
    l.push('ON CONFLICT ("usuario_id", "periodo") DO UPDATE SET "tipo_cambio" = COALESCE("monthly_closes"."tipo_cambio", EXCLUDED."tipo_cambio");');
    l.push('');
  }

  if (r.resumenes.length) {
    l.push(`-- ${r.resumenes.length} resumenes de tarjeta. Sin detalle de consumos: la planilla`);
    l.push('-- guarda el total, no las lineas.');
    l.push('INSERT INTO "statements" ("id", "usuario_id", "file_id", "card", "periodo", "total_ars", "total_usd", "percep_ars", "raw", "pagado") VALUES');
    l.push(r.resumenes.map((s, i) => {
      const id = idDeImport('resumen', s.periodo, s.card, i);
      return `  (${comilla(id)}, ${u}, ${comilla(id)}, ${comilla(s.card)}, ${comilla(s.periodo)}, ${num(s.totalArs)}, 0, 0, '{"origen":"planilla"}'::jsonb, ${s.pagado})`;
    }).join(',\n'));
    l.push('ON CONFLICT ("usuario_id", "file_id") DO NOTHING;');
    l.push('');
  }

  if (r.gastos.length) {
    l.push(`-- ${r.gastos.length} gastos sueltos. Los negativos son reintegros: bajan el gasto`);
    l.push('-- del mes sin inflar el sueldo.');
    l.push('INSERT INTO "gastos" ("id", "usuario_id", "file_id", "periodo", "concepto", "categoria", "monto_ars", "monto_usd", "origen", "pagado", "corregido") VALUES');
    l.push(r.gastos.map((g, i) => {
      const id = idDeImport('gasto', g.periodo, g.concepto, i);
      return `  (${comilla(id)}, ${u}, ${comilla(id)}, ${comilla(g.periodo)}, ${comilla(g.concepto)}, ${comilla(g.categoria)}, ${num(g.montoArs)}, 0, 'PLANILLA', ${g.pagado}, true)`;
    }).join(',\n'));
    l.push('ON CONFLICT ("usuario_id", "file_id") DO NOTHING;');
    l.push('');
  }

  if (r.ingresos.length) {
    l.push(`-- ${r.ingresos.length} entradas que no son sueldo: reintegros de tarjeta, plata`);
    l.push('-- que te devolvieron, extras.');
    l.push('INSERT INTO "ingresos" ("id", "usuario_id", "file_id", "periodo", "concepto", "tipo", "monto_ars", "monto_usd", "origen") VALUES');
    l.push(r.ingresos.map((g, i) => {
      const id = idDeImport('ingreso', g.periodo, g.concepto, i);
      return `  (${comilla(id)}, ${u}, ${comilla(id)}, ${comilla(g.periodo)}, ${comilla(g.concepto)}, ${comilla(g.tipo)}, ${num(g.montoArs)}, 0, 'PLANILLA')`;
    }).join(',\n'));
    l.push('ON CONFLICT ("usuario_id", "file_id") DO NOTHING;');
    l.push('');
  }

  l.push('COMMIT;');
  l.push('');
  l.push('-- Verificacion: ningun mes puede tener dolares sin tipo de cambio.');
  l.push('-- Si esta consulta devuelve filas, esos meses no se van a poder totalizar.');
  l.push('SELECT s."periodo", s."neto_usd", c."tipo_cambio"');
  l.push('FROM "salaries" s LEFT JOIN "monthly_closes" c');
  l.push('  ON c."usuario_id" = s."usuario_id" AND c."periodo" = s."periodo"');
  l.push(`WHERE s."usuario_id" = ${u} AND s."neto_usd" > 0 AND c."tipo_cambio" IS NULL;`);

  return l.join('\n') + '\n';
}

/** Las categorias iniciales mas las dos que este import necesita. */
export const CATEGORIAS_DEL_IMPORT = [
  'Suscripciones', 'Servicios', 'Salud y deporte', 'Supermercado y comida',
  'Compras y hogar', 'Cuotas', 'Comisiones bancarias', 'Impuestos y percepciones',
  'Alquiler', 'Transporte', 'Educacion', CATEGORIA_INVERSION, 'Otros',
];
