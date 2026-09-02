import { pgTable, text, timestamp, numeric, jsonb, boolean, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from './id';

// Quien es dueño de cada dato.
//
// Hoy entra una sola persona, pero el dueño se guarda igual desde el principio:
// agregar la columna despues, con datos adentro, obliga a adivinar de quien era
// cada fila. El email es la llave contra la sesion de Google.
export const usuarios = pgTable('usuarios', {
  id: text('id').primaryKey().$defaultFn(createId),
  email: text('email').notNull().unique(),
  nombre: text('nombre'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Toda tabla con dueño lleva esta columna. Las hijas (consumos, positions,
// devoluciones) NO la llevan: se scopean por su padre, asi no puede quedar una
// fila hija apuntando a un usuario distinto que el de su padre.
const duenio = () => text('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' });

export const statements = pgTable('statements', {
  id: text('id').primaryKey().$defaultFn(createId),
  usuarioId: duenio(),
  fileId: text('file_id').notNull(),          // id del PDF en Drive, evita reprocesar
  card: text('card').notNull(),               // MASTER | VISA | otra
  periodo: text('periodo').notNull(),         // YYYY-MM (mes de vencimiento)
  vencimiento: timestamp('vencimiento'),
  totalArs: numeric('total_ars', { precision: 14, scale: 2 }).notNull(),
  totalUsd: numeric('total_usd', { precision: 10, scale: 2 }).notNull(),
  percepArs: numeric('percep_ars', { precision: 14, scale: 2 }).notNull(), // RG 4815/5617
  raw: jsonb('raw').notNull(),
  // Un resumen se paga entero: no tiene sentido marcar linea por linea.
  pagado: boolean('pagado').notNull().default(false),
  pagadoEn: text('pagado_en'),                 // YYYY-MM-DD
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Unico por usuario y no global: dos personas pueden tener el mismo archivo,
  // y con un unique global el segundo en subirlo se comeria un error ajeno.
}, t => [uniqueIndex('statement_usuario_file').on(t.usuarioId, t.fileId)]);

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
  usuarioId: duenio(),
  fileId: text('file_id').notNull(),
  periodo: text('periodo').notNull(),
  // Un sueldo puede venir partido en dos monedas. Se guardan las dos partes
  // crudas y no un total ya convertido: el total depende del tipo de cambio, y
  // guardar el resultado congelaria una conversion que despues no se puede
  // rehacer si el tipo de cambio del mes estaba mal cargado.
  netoArs: numeric('neto_ars', { precision: 14, scale: 2 }).notNull(),
  netoUsd: numeric('neto_usd', { precision: 12, scale: 2 }).notNull().default('0'),
  corregido: boolean('corregido').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('salary_usuario_periodo').on(t.usuarioId, t.periodo)]);

export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: text('id').primaryKey().$defaultFn(createId),
  usuarioId: duenio(),
  periodo: text('periodo').notNull(),
  plataforma: text('plataforma').notNull(),
  totalUsd: numeric('total_usd', { precision: 14, scale: 2 }),
  totalArs: numeric('total_ars', { precision: 16, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('snapshot_periodo_plataforma').on(t.usuarioId, t.periodo, t.plataforma)]);

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
  usuarioId: duenio(),
  periodo: text('periodo').notNull(),
  // Las cuatro cifras crudas, cada una en su moneda. El total consolidado NO
  // se guarda: se deriva con `tipoCambio`, asi si el tipo de cambio del mes
  // estaba mal cargado alcanza con corregirlo y todo se recalcula.
  ingresoArs: numeric('ingreso_ars', { precision: 14, scale: 2 }).notNull(),
  ingresoUsd: numeric('ingreso_usd', { precision: 12, scale: 2 }).notNull().default('0'),
  gastoArs: numeric('gasto_ars', { precision: 14, scale: 2 }).notNull(),
  gastoUsd: numeric('gasto_usd', { precision: 10, scale: 2 }).notNull(),
  // El tipo de cambio con el que se consolido ESTE mes, congelado al cerrarlo.
  // Sin esto, mirar un mes de hace un año con el dolar de hoy diria que
  // ganabas una fortuna: la conversion tiene que ser la de su momento.
  tipoCambio: numeric('tipo_cambio', { precision: 14, scale: 4 }),
  percepArs: numeric('percep_ars', { precision: 14, scale: 2 }).notNull(),
  ahorroArs: numeric('ahorro_ars', { precision: 14, scale: 2 }).notNull(),
  // null cuando no hay recibo cargado: 0% y "no se sabe" no son lo mismo.
  tasaAhorro: numeric('tasa_ahorro', { precision: 6, scale: 2 }),
  porCategoria: jsonb('por_categoria').notNull(),
  calculadoAt: timestamp('calculado_at').defaultNow().notNull(),
}, t => [uniqueIndex('cierre_usuario_periodo').on(t.usuarioId, t.periodo)]);

// Gastos que no vienen de un resumen de tarjeta: boletas de servicios, el
// alquiler (que muchas veces es un papel sin version digital) y lo que se carga
// escribiendolo. Tabla aparte de `consumos` porque estos no cuelgan de ningun
// statement, pero suman al mismo cierre mensual.
export const gastos = pgTable('gastos', {
  id: text('id').primaryKey().$defaultFn(createId),
  usuarioId: duenio(),
  // Hash del archivo si vino de uno; null si se cargo por texto.
  fileId: text('file_id'),
  periodo: text('periodo').notNull(),          // YYYY-MM al que imputa
  fecha: text('fecha'),                        // YYYY-MM-DD si el comprobante la trae
  concepto: text('concepto').notNull(),        // "Luz - EDET", "Alquiler septiembre"
  categoria: text('categoria').notNull(),
  montoArs: numeric('monto_ars', { precision: 14, scale: 2 }).notNull(),
  montoUsd: numeric('monto_usd', { precision: 10, scale: 2 }).notNull().default('0'),
  origen: text('origen').notNull(),            // BOLETA | FOTO | TEXTO | MANUAL
  // Cargar un gasto y pagarlo son dos momentos distintos: la boleta de luz
  // entra cuando llega y se paga dias despues. Sin este estado, "cuanto me
  // falta pagar este mes" no se puede responder.
  pagado: boolean('pagado').notNull().default(false),
  pagadoEn: text('pagado_en'),                 // YYYY-MM-DD
  // Marca si una persona corrigio lo que interpreto el modelo: sirve para saber
  // en que datos confiar y para no pisarlos si se reprocesa el documento.
  corregido: boolean('corregido').notNull().default(false),
  notas: text('notas'),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('gasto_usuario_file').on(t.usuarioId, t.fileId)]);

// Prestamos y creditos. No son un gasto: son un compromiso con cronograma.
//
// Se guarda el plan (cuantas cuotas, de cuanto, desde cuando) y no una fila por
// cuota: con el plan se deriva cual cuota cae en cada mes, cuantas faltan y
// cuanto se debe, sin depender de que alguien corra un proceso todos los meses.
// Una fila por cuota se desincroniza en cuanto cambia algo.
//
// La cuota del mes entra al cierre desde acá, calculada al vuelo. Por eso no
// hay que cargarla ademas como gasto suelto: se contaria dos veces.
export const prestamos = pgTable('prestamos', {
  id: text('id').primaryKey().$defaultFn(createId),
  usuarioId: duenio(),
  nombre: text('nombre').notNull(),                // "Prestamo personal Galicia"
  entidad: text('entidad'),                        // banco o financiera
  // Lo que te prestaron. Es informativo: el gasto mensual sale de la cuota, y
  // la suma de las cuotas siempre es mayor que esto (esa diferencia es el costo).
  montoOtorgado: numeric('monto_otorgado', { precision: 14, scale: 2 }),
  cuotas: numeric('cuotas', { precision: 5, scale: 0 }).notNull(),
  cuotaArs: numeric('cuota_ars', { precision: 14, scale: 2 }).notNull(),
  primerPeriodo: text('primer_periodo').notNull(), // YYYY-MM de la cuota 1
  moneda: text('moneda').notNull().default('ARS'), // ARS | USD
  // CFT anual si lo sabes. No se usa para calcular: se muestra, porque es el
  // numero que permite comparar dos prestamos y casi nunca esta a la vista.
  cftAnual: numeric('cft_anual', { precision: 8, scale: 2 }),
  // Cancelado antes de tiempo: deja de sumar al cierre desde el mes indicado.
  canceladoEn: text('cancelado_en'),               // YYYY-MM, opcional
  notas: text('notas'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Metas de ahorro. La moneda importa: una meta en pesos a dos años no dice nada
// sin ajuste, asi que el default es USD y el progreso se mide en USD reales.
export const goals = pgTable('goals', {
  id: text('id').primaryKey().$defaultFn(createId),
  usuarioId: duenio(),
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
  usuarioId: duenio(),
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
  refExterna: text('ref_externa'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Por usuario: dos personas pueden importar el mismo trade de Binance si
  // comparten una cuenta, y ninguna tiene que pisar a la otra.
}, t => [uniqueIndex('transaccion_usuario_ref').on(t.usuarioId, t.refExterna)]);

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
  usuarioId: duenio(),
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
  usuarioId: duenio(),
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
  usuarioId: duenio(),
  clave: text('clave').notNull(),
  valor: jsonb('valor').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // La clave sola no alcanza como primaria: dos personas tienen cada una su
  // "tipoCambioArs" y no se pueden pisar.
}, t => [primaryKey({ columns: [t.usuarioId, t.clave] })]);

// Plata que le prestaste a alguien y te tiene que devolver.
//
// NO es un gasto. Salio de tu bolsillo, pero sigue siendo tuya: es un credito a
// favor, no plata consumida. Contarla como gasto hundiria la tasa de ahorro del
// mes en que prestas y la inflaria cuando te devuelven, dos veces mal por el
// mismo movimiento. Por eso vive aparte y no toca `calcularCierre`.
//
// La devolucion casi nunca es de una: se paga por partes, cuando se puede. Por
// eso las devoluciones son filas propias y el saldo se deriva, en vez de un
// campo "devuelto" que hay que acordarse de actualizar.
export const prestamosPersonales = pgTable('prestamos_personales', {
  id: text('id').primaryKey().$defaultFn(createId),
  usuarioId: duenio(),
  persona: text('persona').notNull(),              // a quien le prestaste
  concepto: text('concepto'),                      // "para el alquiler", "arreglo del auto"
  monto: numeric('monto', { precision: 14, scale: 2 }).notNull(),
  moneda: text('moneda').notNull().default('ARS'), // ARS | USD
  fecha: text('fecha').notNull(),                  // YYYY-MM-DD
  // Darlo por perdido es una decision, no un olvido: deja de figurar como algo
  // que esperas cobrar, pero la fila queda para no volver a prestar sin saberlo.
  perdonado: boolean('perdonado').notNull().default(false),
  notas: text('notas'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const devoluciones = pgTable('devoluciones', {
  id: text('id').primaryKey().$defaultFn(createId),
  prestamoId: text('prestamo_id').notNull()
    .references(() => prestamosPersonales.id, { onDelete: 'cascade' }),
  fecha: text('fecha').notNull(),                  // YYYY-MM-DD
  monto: numeric('monto', { precision: 14, scale: 2 }).notNull(),
  notas: text('notas'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const statementsRelations = relations(statements, ({ many }) => ({ consumos: many(consumos) }));
export const consumosRelations = relations(consumos, ({ one }) => ({
  statement: one(statements, { fields: [consumos.statementId], references: [statements.id] }),
}));
export const snapshotsRelations = relations(portfolioSnapshots, ({ many }) => ({ positions: many(positions) }));
export const positionsRelations = relations(positions, ({ one }) => ({
  snapshot: one(portfolioSnapshots, { fields: [positions.snapshotId], references: [portfolioSnapshots.id] }),
}));

export const prestamosPersonalesRelations = relations(prestamosPersonales, ({ many }) => ({
  devoluciones: many(devoluciones),
}));
export const devolucionesRelations = relations(devoluciones, ({ one }) => ({
  prestamo: one(prestamosPersonales, {
    fields: [devoluciones.prestamoId], references: [prestamosPersonales.id],
  }),
}));
