-- Plata que entra y no es sueldo: ganancias de inversion, reintegros, extras.
--
-- Hasta ahora el unico ingreso era el recibo. Una inversion que rinde no tenia
-- donde entrar, y el mes mostraba una tasa de ahorro peor que la real.

CREATE TABLE IF NOT EXISTS "ingresos" (
  "id" text PRIMARY KEY NOT NULL,
  "usuario_id" text NOT NULL,
  "periodo" text NOT NULL,
  "fecha" text,
  "concepto" text NOT NULL,
  "tipo" text DEFAULT 'EXTRA' NOT NULL,
  "monto_ars" numeric(14, 2) DEFAULT '0' NOT NULL,
  "monto_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  "origen" text DEFAULT 'MANUAL' NOT NULL,
  "file_id" text,
  "notas" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Borrar un usuario se lleva sus ingresos, igual que el resto de sus datos.
ALTER TABLE "ingresos" DROP CONSTRAINT IF EXISTS "ingresos_usuario_fk";
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_usuario_fk"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Por usuario y no global: dos personas pueden importar el mismo archivo.
CREATE UNIQUE INDEX IF NOT EXISTS "ingreso_usuario_file" ON "ingresos" ("usuario_id", "file_id");
CREATE INDEX IF NOT EXISTS "ingreso_usuario_periodo" ON "ingresos" ("usuario_id", "periodo");
