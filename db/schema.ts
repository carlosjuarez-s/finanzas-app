import { pgTable, text, timestamp, numeric, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from './id';

export const statements = pgTable('statements', {
  id: text('id').primaryKey().$defaultFn(createId),
  fileId: text('file_id').notNull().unique(), // id del PDF en Drive, evita reprocesar
  card: text('card').notNull(),               // MASTER | VISA | otra
  periodo: text('periodo').notNull(),         // YYYY-MM (mes de vencimiento)
  vencimiento: timestamp('vencimiento'),
  totalArs: numeric('total_ars', { precision: 14, scale: 2 }).notNull(),
  totalUsd: numeric('total_usd', { precision: 10, scale: 2 }).notNull(),
  percepArs: numeric('percep_ars', { precision: 14, scale: 2 }).notNull(), // RG 4815/5617
  raw: jsonb('raw').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const consumos = pgTable('consumos', {
  id: text('id').primaryKey().$defaultFn(createId),
  statementId: text('statement_id').notNull().references(() => statements.id, { onDelete: 'cascade' }),
  fecha: text('fecha').notNull(),
  comercio: text('comercio').notNull(),
  categoria: text('categoria').notNull(),
  cuota: text('cuota'),
  montoArs: numeric('monto_ars', { precision: 14, scale: 2 }).notNull(),
  montoUsd: numeric('monto_usd', { precision: 10, scale: 2 }).notNull(),
  // Lo corrigio una persona: el dato manda sobre lo que interpreto el modelo.
  corregido: boolean('corregido').notNull().default(false),
});

export const salaries = pgTable('salaries', {
  id: text('id').primaryKey().$defaultFn(createId),
  fileId: text('file_id').notNull(),
  periodo: text('periodo').notNull().unique(),
  netoArs: numeric('neto_ars', { precision: 14, scale: 2 }).notNull(),
  corregido: boolean('corregido').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: text('id').primaryKey().$defaultFn(createId),
  periodo: text('periodo').notNull(),
  plataforma: text('plataforma').notNull(),
  totalUsd: numeric('total_usd', { precision: 14, scale: 2 }),
  totalArs: numeric('total_ars', { precision: 16, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('snapshot_periodo_plataforma').on(t.periodo, t.plataforma)]);

export const positions = pgTable('positions', {
  id: text('id').primaryKey().$defaultFn(createId),
  snapshotId: text('snapshot_id').notNull().references(() => portfolioSnapshots.id, { onDelete: 'cascade' }),
  activo: text('activo').notNull(),
  clase: text('clase').notNull(), // CRIPTO | CEDEAR | RENTA_FIJA | FCI | DOLAR
  cantidad: numeric('cantidad', { precision: 20, scale: 8 }).notNull(),
  valorUsd: numeric('valor_usd', { precision: 14, scale: 2 }),
  valorArs: numeric('valor_ars', { precision: 16, scale: 2 }),
});

// Cierre ya calculado de cada mes. Es una vista materializada de statements +
// consumos + salaries: se recalcula despues de cada sync o upload. Existe para
// que el historico (graficos, proyecciones, metas) no tenga que recorrer todos
// los consumos de todos los meses cada vez que se lo consulta.
export const monthlyCloses = pgTable('monthly_closes', {
  id: text('id').primaryKey().$defaultFn(createId),
  periodo: text('periodo').notNull().unique(),
  ingresoArs: numeric('ingreso_ars', { precision: 14, scale: 2 }).notNull(),
  gastoArs: numeric('gasto_ars', { precision: 14, scale: 2 }).notNull(),
  gastoUsd: numeric('gasto_usd', { precision: 10, scale: 2 }).notNull(),
  percepArs: numeric('percep_ars', { precision: 14, scale: 2 }).notNull(),
  ahorroArs: numeric('ahorro_ars', { precision: 14, scale: 2 }).notNull(),
  // null cuando no hay recibo cargado: 0% y "no se sabe" no son lo mismo.
  tasaAhorro: numeric('tasa_ahorro', { precision: 6, scale: 2 }),
  porCategoria: jsonb('por_categoria').notNull(),
  calculadoAt: timestamp('calculado_at').defaultNow().notNull(),
});

// Gastos que no vienen de un resumen de tarjeta: boletas de servicios, el
// alquiler (que muchas veces es un papel sin version digital) y lo que se carga
// escribiendolo. Tabla aparte de `consumos` porque estos no cuelgan de ningun
// statement, pero suman al mismo cierre mensual.
export const gastos = pgTable('gastos', {
  id: text('id').primaryKey().$defaultFn(createId),
  // Hash del archivo si vino de uno; null si se cargo por texto.
  fileId: text('file_id').unique(),
  periodo: text('periodo').notNull(),          // YYYY-MM al que imputa
  fecha: text('fecha'),                        // YYYY-MM-DD si el comprobante la trae
  concepto: text('concepto').notNull(),        // "Luz - EDET", "Alquiler septiembre"
  categoria: text('categoria').notNull(),
  montoArs: numeric('monto_ars', { precision: 14, scale: 2 }).notNull(),
  montoUsd: numeric('monto_usd', { precision: 10, scale: 2 }).notNull().default('0'),
  origen: text('origen').notNull(),            // BOLETA | FOTO | TEXTO | MANUAL
  // Marca si una persona corrigio lo que interpreto el modelo: sirve para saber
  // en que datos confiar y para no pisarlos si se reprocesa el documento.
  corregido: boolean('corregido').notNull().default(false),
  notas: text('notas'),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Metas de ahorro. La moneda importa: una meta en pesos a dos años no dice nada
// sin ajuste, asi que el default es USD y el progreso se mide en USD reales.
export const goals = pgTable('goals', {
  id: text('id').primaryKey().$defaultFn(createId),
  nombre: text('nombre').notNull(),
  montoObjetivo: numeric('monto_objetivo', { precision: 14, scale: 2 }).notNull(),
  moneda: text('moneda').notNull().default('USD'),  // ARS | USD
  fechaObjetivo: text('fecha_objetivo'),            // YYYY-MM, opcional
  notas: text('notas'),
  archivada: boolean('archivada').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Libro de transacciones. Es lo que las fotos del portafolio NO pueden dar:
// una tenencia dice cuanto tenes, no cuanto pagaste. Sin esto no hay ganancia.
//
// Se guardan las operaciones y no un promedio ya calculado: con el libro entero
// se puede computar cualquier metodo (promedio ponderado, FIFO) despues, incluso
// retroactivamente. Guardar solo el promedio es una puerta que se cierra.
export const transacciones = pgTable('transacciones', {
  id: text('id').primaryKey().$defaultFn(createId),
  activo: text('activo').notNull(),                // BTC, AAPL, AL30
  clase: text('clase').notNull(),                  // CRIPTO | CEDEAR | RENTA_FIJA | FCI | DOLAR
  tipo: text('tipo').notNull(),                    // COMPRA | VENTA
  fecha: text('fecha').notNull(),                  // YYYY-MM-DD
  cantidad: numeric('cantidad', { precision: 20, scale: 8 }).notNull(),
  precioUnitario: numeric('precio_unitario', { precision: 20, scale: 8 }).notNull(),
  moneda: text('moneda').notNull(),                // ARS | USD
  // El tipo de cambio del DIA de la operacion, no el de hoy: convertir todo al
  // dolar actual borraria justamente el efecto que queremos medir.
  tipoCambioDia: numeric('tipo_cambio_dia', { precision: 14, scale: 4 }),
  comision: numeric('comision', { precision: 20, scale: 8 }).notNull().default('0'),
  origen: text('origen').notNull(),                // MANUAL | BINANCE | IOL | FOTO
  // Id de la operacion en la plataforma: evita duplicar al reimportar.
  refExterna: text('ref_externa').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Eventos del activo, no operaciones tuyas: cambios de ratio de CEDEAR, splits,
// dividendos en acciones.
//
// Sin esto el calculo se rompe en silencio. Los ratios de CEDEAR cambian —en
// enero de 2024 la CNV modifico 30 de golpe— y cuando pasa, tu cantidad se
// multiplica y el precio unitario baja igual: el valor total no se mueve. Pero
// comparar contra el precio de entrada viejo mostraria una perdida enorme que
// nunca ocurrio.
export const eventosActivo = pgTable('eventos_activo', {
  id: text('id').primaryKey().$defaultFn(createId),
  activo: text('activo').notNull(),
  fecha: text('fecha').notNull(),                  // YYYY-MM-DD
  tipo: text('tipo').notNull(),                    // RATIO | SPLIT | DIVIDENDO_ACCIONES
  // 4 si una unidad pasa a ser cuatro. La cantidad se multiplica por el factor
  // y el costo unitario se divide por el mismo numero.
  factor: numeric('factor', { precision: 14, scale: 6 }).notNull(),
  notas: text('notas'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Conexiones a brokers y exchanges. El secreto va cifrado con AES-256-GCM
// (lib/boveda.ts) y atado por AAD al id de esta fila, asi que no se puede mover
// a otra conexion. La clave que lo abre vive en el entorno, nunca acá: quien se
// lleve un dump de la base no se lleva credenciales utilizables.
//
// No hay columna "solo lectura garantizada": eso es una propiedad de la
// plataforma y vive en lib/plataformas.ts, para que no pueda quedar mal escrita
// en una fila y mentirle a la UI.
export const conexiones = pgTable('conexiones', {
  id: text('id').primaryKey().$defaultFn(createId),
  plataforma: text('plataforma').notNull(),        // BINANCE | IOL
  etiqueta: text('etiqueta').notNull(),            // "Binance principal"
  secreto: jsonb('secreto').notNull(),             // { v, iv, tag, datos }
  pista: text('pista').notNull(),                  // ••••4f2a, para reconocerla
  estado: text('estado').notNull().default('ACTIVA'), // ACTIVA | VENCIDA | ERROR
  ultimoSync: timestamp('ultimo_sync'),
  // Siempre censurado antes de escribirse: un error de la API puede traer la
  // credencial en el texto (lib/secretos.ts).
  ultimoError: text('ultimo_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Clave-valor para los supuestos de proyeccion (retornos, tipo de cambio) y lo
// que se quiera hacer configurable despues, sin una migracion por cada opcion.
export const settings = pgTable('settings', {
  clave: text('clave').primaryKey(),
  valor: jsonb('valor').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const statementsRelations = relations(statements, ({ many }) => ({ consumos: many(consumos) }));
export const consumosRelations = relations(consumos, ({ one }) => ({
  statement: one(statements, { fields: [consumos.statementId], references: [statements.id] }),
}));
export const snapshotsRelations = relations(portfolioSnapshots, ({ many }) => ({ positions: many(positions) }));
export const positionsRelations = relations(positions, ({ one }) => ({
  snapshot: one(portfolioSnapshots, { fields: [positions.snapshotId], references: [portfolioSnapshots.id] }),
}));
