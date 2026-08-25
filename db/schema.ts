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
});

export const salaries = pgTable('salaries', {
  id: text('id').primaryKey().$defaultFn(createId),
  fileId: text('file_id').notNull(),
  periodo: text('periodo').notNull().unique(),
  netoArs: numeric('neto_ars', { precision: 14, scale: 2 }).notNull(),
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
