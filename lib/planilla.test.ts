import test from 'node:test';
import assert from 'node:assert/strict';
import {
  indiceDeMes, asignarAnios, verificar, monto, esSalarial, tipoCambioDeLaNota,
  categoriaDe, estaPagado, interpretar, aSql, bloquesDuplicados, type Cruda,
} from './planilla';

const fila = (o: Partial<Cruda> & { fila: number; mes: string }): Cruda => ({
  nombre: 'X', tipo: 'Egreso', subtipo: '', status: 'Pagado', costo: -100, desc: '',
  anioVencimiento: null, ...o,
});

test('el mes se lee con o sin acento y sin importar mayusculas', () => {
  assert.equal(indiceDeMes('Septiembre'), 9);
  assert.equal(indiceDeMes('  DICIEMBRE '), 12);
  assert.equal(indiceDeMes('Febrero'), 2);
  assert.equal(indiceDeMes('no es un mes'), null);
});

test('el año cambia cuando Enero sigue a Diciembre', () => {
  const filas = ['Noviembre', 'Diciembre', 'Enero', 'Febrero'].map((mes, i) => fila({ fila: i + 1, mes }));
  assert.deepEqual(asignarAnios(filas, 2024), [2024, 2024, 2025, 2025]);
});

test('un Enero que no sigue a Diciembre no cambia el año', () => {
  // La primera region de la planilla esta desordenada: Marzo, Febrero, Julio.
  // Solo el par Diciembre→Enero marca el corte.
  const filas = ['Marzo', 'Febrero', 'Julio', 'Marzo'].map((mes, i) => fila({ fila: i + 1, mes }));
  assert.deepEqual(asignarAnios(filas, 2024), [2024, 2024, 2024, 2024]);
});

test('la verificacion falla si el año inferido contradice un vencimiento', () => {
  // Es el guardarraíl: sin esto, un año mal inferido escribe tres años corridos.
  const filas = [fila({ fila: 2, mes: 'Marzo', anioVencimiento: 2025 })];
  const v = verificar(filas, [2024], { anio: 2025, mes: 3 });
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.motivo : '', /vencimiento dice 2025/);
});

test('la verificacion falla si la ultima fila no cae cerca de hoy', () => {
  const filas = [fila({ fila: 2, mes: 'Marzo' })];
  const v = verificar(filas, [2020], { anio: 2026, mes: 9 });
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.motivo : '', /año inicial/);
});

test('la verificacion pasa cuando las dos anclas cierran', () => {
  const filas = [
    fila({ fila: 2, mes: 'Marzo', anioVencimiento: 2024 }),
    fila({ fila: 3, mes: 'Diciembre' }),
    fila({ fila: 4, mes: 'Enero' }),
    fila({ fila: 5, mes: 'Septiembre' }),
  ];
  const anios = asignarAnios(filas, 2024);
  assert.deepEqual(anios, [2024, 2024, 2025, 2025]);
  assert.deepEqual(verificar(filas, anios, { anio: 2025, mes: 9 }), { ok: true });
});

test('un monto guardado como texto se lee igual', () => {
  assert.equal(monto('-234385.45'), -234385.45);
  assert.equal(monto(-100), -100);
  assert.equal(monto('$ 249.000'), 249000);
  assert.equal(monto(null), null);
  assert.equal(monto(''), null);
  assert.equal(monto('sin dato'), null);
});

test('solo el sueldo es sueldo', () => {
  for (const si of ['Salario', 'Salario USD', 'Sueldo Cambio en Dólares', 'Aguinaldo']) {
    assert.equal(esSalarial(si), true, si);
  }
  // Un reintegro de tarjeta no es ingreso salarial, por mas que entre plata.
  for (const no of ['Tarjetas', 'Naranja', 'Anteojos de papá', 'Gimnasio Flor', 'Sobrante']) {
    assert.equal(esSalarial(no), false, no);
  }
});

test('se lee el tipo de cambio que la planilla anota al lado del sueldo', () => {
  assert.equal(tipoCambioDeLaNota('Dolar hoy: 1235'), 1235);
  assert.equal(tipoCambioDeLaNota('Dólar hoy 1000'), 1000);
  assert.equal(tipoCambioDeLaNota('sin nota'), null);
});

test('la categoria sale del nombre', () => {
  assert.equal(categoriaDe('Alquiler'), 'Alquiler');
  assert.equal(categoriaDe('Super Mensual'), 'Supermercado y comida');
  assert.equal(categoriaDe('Gas'), 'Servicios');
  assert.equal(categoriaDe('HSBC Prestamo'), 'Cuotas');
  assert.equal(categoriaDe('Compra USDT'), 'Inversiones');
  assert.equal(categoriaDe('Paga de DANI'), 'Otros');
});

test('pagado es solo "Pagado"', () => {
  assert.equal(estaPagado('Pagado'), true);
  assert.equal(estaPagado('Pendiente'), false);
  assert.equal(estaPagado('No iniciado'), false);
});

test('el sueldo de un mes junta todas sus filas en una sola', () => {
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Junio', tipo: 'Ingreso', nombre: 'Salario', costo: 701000 }),
    fila({ fila: 3, mes: 'Junio', tipo: 'Ingreso', nombre: 'Salario USD', costo: 410000, desc: 'Dolar hoy: 1000' }),
  ];
  const r = interpretar(filas, [2024, 2024]);
  assert.equal(r.sueldos.length, 1);
  assert.deepEqual(r.sueldos[0], { periodo: '2024-06', netoArs: 701000, netoUsd: 410, tipoCambio: 1000 });
});

test('sin la nota del dolar, el sueldo en dolares entra como pesos', () => {
  // No hay con que convertirlo, y estimar una cotizacion seria inventarla.
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Agosto', tipo: 'Ingreso', nombre: 'Salario USD', costo: 1157000 }),
  ];
  const r = interpretar(filas, [2024]);
  assert.deepEqual(r.sueldos[0], { periodo: '2024-08', netoArs: 1157000, netoUsd: 0, tipoCambio: null });
});

test('un reintegro no es sueldo ni un gasto negativo: es un ingreso aparte', () => {
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Junio', tipo: 'Reingreso', nombre: 'Naranja', costo: 63885 }),
  ];
  const r = interpretar(filas, [2024]);
  assert.equal(r.sueldos.length, 0);
  assert.equal(r.gastos.length, 0);
  assert.deepEqual(r.ingresos, [
    { periodo: '2024-06', concepto: 'Naranja', tipo: 'REINTEGRO', montoArs: 63885 },
  ]);
});

test('un aguinaldo positivo dentro de Egreso se toma como ingreso, y se anota', () => {
  const filas: Cruda[] = [
    fila({ fila: 293, mes: 'Diciembre', tipo: 'Egreso', nombre: 'Aguinaldo', costo: 794838.5 }),
  ];
  const r = interpretar(filas, [2024]);
  assert.equal(r.sueldos[0].netoArs, 794838.5);
  assert.equal(r.gastos.length, 0);
  assert.match(r.rectificaciones[0].detalle, /se toma como ingreso/);
});

test('un egreso con signo positivo se corrige y queda anotado', () => {
  const filas: Cruda[] = [fila({ fila: 181, mes: 'Septiembre', nombre: 'Luz', costo: 53950 })];
  const r = interpretar(filas, [2024]);
  assert.equal(r.gastos[0].montoArs, 53950);
  assert.match(r.rectificaciones[0].detalle, /monto positivo/);
});

test('las tarjetas van a resumenes, no a gastos sueltos', () => {
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Marzo', subtipo: 'Tarjeta', nombre: 'Galicia Visa Credito', costo: -1230000 }),
  ];
  const r = interpretar(filas, [2026]);
  assert.equal(r.gastos.length, 0);
  assert.deepEqual(r.resumenes[0], { periodo: '2026-03', card: 'Galicia Visa Credito', totalArs: 1230000, pagado: true });
});

test('una fila sin monto se descarta con el motivo, no se toma como cero', () => {
  const filas: Cruda[] = [fila({ fila: 242, mes: 'Octubre', tipo: 'Ingreso', nombre: 'Salario', costo: null })];
  const r = interpretar(filas, [2024]);
  assert.equal(r.sueldos.length, 0);
  assert.equal(r.descartes.length, 1);
  assert.match(r.descartes[0].detalle, /Sin monto/);
});

test('el estado de pago viaja al gasto', () => {
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Septiembre', nombre: 'Alquiler', costo: -500000, status: 'No iniciado' }),
  ];
  const r = interpretar(filas, [2026]);
  assert.equal(r.gastos[0].pagado, false);
});

test('el SQL es idempotente: cada fila lleva un id derivado del contenido', () => {
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Junio', nombre: 'Alquiler', costo: -340000 }),
    fila({ fila: 3, mes: 'Junio', tipo: 'Ingreso', nombre: 'Salario', costo: 900000 }),
    fila({ fila: 4, mes: 'Junio', subtipo: 'Tarjeta', nombre: 'Galicia Visa Credito', costo: -120000 }),
  ];
  const sql = aSql(interpretar(filas, [2024, 2024, 2024]), 'usuario-inicial');
  // Sin ON CONFLICT, correrlo dos veces duplicaria tres años de historia.
  assert.equal((sql.match(/ON CONFLICT/g) ?? []).length, 5);
  assert.match(sql, /planilla:gasto:2024-06:alquiler:0/);
  assert.match(sql, /planilla:resumen:2024-06:galicia-visa-credito:0/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});

test('el SQL escapa las comillas de un concepto', () => {
  // "Regalo de Lucia's" romperia el INSERT y, peor, podria cerrar la cadena.
  const filas: Cruda[] = [fila({ fila: 2, mes: 'Junio', nombre: "Anteojos d'papá", costo: -1000 })];
  const sql = aSql(interpretar(filas, [2024]), 'u');
  assert.match(sql, /'Anteojos d''papá'/);
});

test('sin meses con dolares no se toca monthly_closes', () => {
  const filas: Cruda[] = [fila({ fila: 2, mes: 'Junio', tipo: 'Ingreso', nombre: 'Salario', costo: 900000 })];
  const sql = aSql(interpretar(filas, [2024]), 'u');
  assert.equal(/monthly_closes/.test(sql.split('COMMIT;')[0]), false);
});

test('un mes con sueldo en dolares siembra su tipo de cambio', () => {
  // Sin esto el cierre consolidaria un mes de 2024 con el dolar de hoy.
  const filas: Cruda[] = [
    fila({ fila: 2, mes: 'Junio', tipo: 'Ingreso', nombre: 'Salario USD', costo: 410000, desc: 'Dolar hoy: 1000' }),
  ];
  const sql = aSql(interpretar(filas, [2024]), 'u');
  assert.match(sql, /INSERT INTO "monthly_closes"/);
  assert.match(sql, /1000\.0000/);
  // Y no pisa un tipo de cambio que ya estuviera guardado.
  assert.match(sql, /COALESCE\("monthly_closes"\."tipo_cambio"/);
});

test('un mes cargado dos veces se detecta por el sueldo repetido', () => {
  // Sumar los dos bloques da un mes con el doble de todo, y ese mes corre el
  // promedio de los demas.
  const filas: Cruda[] = [
    fila({ fila: 512, mes: 'Mayo', nombre: 'Alquiler', costo: -460000 }),
    fila({ fila: 518, mes: 'Mayo', tipo: 'Ingreso', nombre: 'Salario', costo: 955488 }),
    fila({ fila: 525, mes: 'Mayo', nombre: 'Alquiler', costo: -460000 }),
    fila({ fila: 527, mes: 'Mayo', tipo: 'Ingreso', nombre: 'Salario', costo: 955488 }),
  ];
  const anios = [2026, 2026, 2026, 2026];
  assert.deepEqual([...bloquesDuplicados(filas, anios)], [0, 1]);

  const r = interpretar(filas, anios);
  assert.equal(r.sueldos.length, 1);
  assert.equal(r.sueldos[0].netoArs, 955488);
  assert.equal(r.gastos.length, 1);
  assert.equal(r.descartes.filter(d => /dos veces/.test(d.detalle)).length, 2);
});

test('dos cuotas de prestamos distintos en un mes NO son un duplicado', () => {
  // Pasa de verdad: dos pagos al mismo banco en el mismo mes. Solo el sueldo
  // repetido marca un bloque duplicado.
  const filas: Cruda[] = [
    fila({ fila: 197, mes: 'Septiembre', nombre: 'HSBC Prestamo', costo: -12254 }),
    fila({ fila: 198, mes: 'Septiembre', nombre: 'HSBC Prestamo', costo: -50415 }),
    fila({ fila: 199, mes: 'Septiembre', tipo: 'Ingreso', nombre: 'Salario', costo: 900000 }),
  ];
  const r = interpretar(filas, [2024, 2024, 2024]);
  assert.equal(r.gastos.length, 2);
  assert.equal(r.descartes.length, 0);
});

test('el corte del bloque duplicado se lleva todas las filas de sueldo, no solo "Salario"', () => {
  // El bloque termina en "Salario" + "Sueldo Cambio en Dolares". Cortando en
  // la primera, la de dolares del bloque viejo sobrevivia y el mes quedaba con
  // medio sueldo de mas.
  const filas: Cruda[] = [
    fila({ fila: 516, mes: 'Mayo', nombre: 'Alquiler', costo: -460000 }),
    fila({ fila: 518, mes: 'Mayo', tipo: 'Ingreso', nombre: 'Salario', costo: 955488 }),
    fila({ fila: 519, mes: 'Mayo', tipo: 'Ingreso', nombre: 'Sueldo Cambio en Dólares', costo: 449020 }),
    fila({ fila: 525, mes: 'Mayo', nombre: 'Alquiler', costo: -460000 }),
    fila({ fila: 527, mes: 'Mayo', tipo: 'Ingreso', nombre: 'Salario', costo: 955488 }),
    fila({ fila: 528, mes: 'Mayo', tipo: 'Ingreso', nombre: 'Sueldo Cambio en Dólares', costo: 449020 }),
  ];
  const r = interpretar(filas, Array(6).fill(2026));
  assert.equal(r.sueldos.length, 1);
  assert.equal(r.sueldos[0].netoArs, 955488 + 449020);
  assert.equal(r.gastos.length, 1);
});

test('un ingreso no salarial que tampoco es reintegro queda como extra', () => {
  const filas: Cruda[] = [
    fila({ fila: 72, mes: 'Marzo', tipo: 'Ingreso', nombre: 'Gimnasio Flor', costo: 16000 }),
  ];
  const r = interpretar(filas, [2024]);
  assert.deepEqual(r.ingresos[0].tipo, 'EXTRA');
  assert.equal(r.sueldos.length, 0);
});
