-- Sueldo en dos monedas, estado de pago, y el tipo de cambio de cada cierre.

-- El sueldo puede venir partido. Las dos partes se guardan crudas: el total
-- depende del tipo de cambio, y guardarlo ya sumado congelaria una conversion
-- que despues no se puede rehacer.
ALTER TABLE "salaries" ADD COLUMN IF NOT EXISTS "neto_usd" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint

-- Cargar un gasto y pagarlo son dos momentos distintos.
ALTER TABLE "gastos"     ADD COLUMN IF NOT EXISTS "pagado" boolean DEFAULT false NOT NULL;
ALTER TABLE "gastos"     ADD COLUMN IF NOT EXISTS "pagado_en" text;
ALTER TABLE "statements" ADD COLUMN IF NOT EXISTS "pagado" boolean DEFAULT false NOT NULL;
ALTER TABLE "statements" ADD COLUMN IF NOT EXISTS "pagado_en" text;
--> statement-breakpoint

-- El tipo de cambio con el que se consolido cada mes, congelado al cerrarlo.
-- Sin esto, mirar un mes de hace un año con el dolar de hoy diria que ganabas
-- una fortuna: la conversion tiene que ser la de su momento.
ALTER TABLE "monthly_closes" ADD COLUMN IF NOT EXISTS "ingreso_usd" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "monthly_closes" ADD COLUMN IF NOT EXISTS "tipo_cambio" numeric(14, 4);
