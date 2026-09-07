-- Gastos fijos declarados: lo que se paga todos los meses, o cada dos, o cada
-- seis, con su aumento si lo tiene.
--
-- La estimacion los adivinaba mirando el historico. Eso no sabe cuando aumenta
-- un alquiler, no reconoce un seguro semestral, y sigue contando meses despues
-- lo que ya diste de baja.

CREATE TABLE IF NOT EXISTS "recurrentes" (
  "id" text PRIMARY KEY NOT NULL,
  "usuario_id" text NOT NULL,
  "concepto" text NOT NULL,
  "categoria" text NOT NULL,
  "monto_ars" numeric(14, 2) DEFAULT '0' NOT NULL,
  "monto_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  "cada_meses" numeric(3, 0) DEFAULT '1' NOT NULL,
  "primer_periodo" text NOT NULL,
  "hasta_periodo" text,
  "aumento_pct" numeric(6, 2),
  "aumento_cada_meses" numeric(3, 0),
  "indice" text,
  "notas" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "recurrentes" DROP CONSTRAINT IF EXISTS "recurrentes_usuario_fk";
ALTER TABLE "recurrentes" ADD CONSTRAINT "recurrentes_usuario_fk"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "recurrente_usuario" ON "recurrentes" ("usuario_id");
