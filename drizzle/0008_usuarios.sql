-- Multiusuario: cada dato pasa a tener dueño.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  EDITÁ ESTA LÍNEA antes de correr: poné tu email, el mismo con el que   │
-- │  entrás por Google (AUTH_EMAILS). Todo lo que ya tenés cargado queda    │
-- │  a nombre de ese usuario.                                              │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL UNIQUE,
	"nombre" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

INSERT INTO "usuarios" ("id", "email", "nombre")
VALUES ('usuario-inicial', 'cambiame@ejemplo.com', NULL)   -- ← TU EMAIL ACÁ
ON CONFLICT ("email") DO NOTHING;
--> statement-breakpoint

-- La columna entra como NULL, se rellena, y recien despues se pone NOT NULL.
-- Al reves fallaria: no se puede agregar una columna obligatoria a una tabla
-- que ya tiene filas sin darle un valor.
ALTER TABLE "statements"           ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "salaries"             ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "portfolio_snapshots"  ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "monthly_closes"       ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "gastos"               ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "prestamos"            ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "goals"                ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "transacciones"        ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "eventos_activo"       ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "conexiones"           ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "settings"             ADD COLUMN IF NOT EXISTS "usuario_id" text;
ALTER TABLE "prestamos_personales" ADD COLUMN IF NOT EXISTS "usuario_id" text;
--> statement-breakpoint

UPDATE "statements"           SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "salaries"             SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "portfolio_snapshots"  SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "monthly_closes"       SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "gastos"               SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "prestamos"            SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "goals"                SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "transacciones"        SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "eventos_activo"       SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "conexiones"           SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "settings"             SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
UPDATE "prestamos_personales" SET "usuario_id" = 'usuario-inicial' WHERE "usuario_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "statements"           ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "salaries"             ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "portfolio_snapshots"  ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "monthly_closes"       ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "gastos"               ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "prestamos"            ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "goals"                ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "transacciones"        ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "eventos_activo"       ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "conexiones"           ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "settings"             ALTER COLUMN "usuario_id" SET NOT NULL;
ALTER TABLE "prestamos_personales" ALTER COLUMN "usuario_id" SET NOT NULL;
--> statement-breakpoint

-- Borrar un usuario se lleva sus datos. Sin la cascada quedarian filas
-- huerfanas apuntando a un id que ya no existe.
ALTER TABLE "statements"           ADD CONSTRAINT "statements_usuario_fk"  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "salaries"             ADD CONSTRAINT "salaries_usuario_fk"    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "portfolio_snapshots"  ADD CONSTRAINT "snapshots_usuario_fk"   FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "monthly_closes"       ADD CONSTRAINT "cierres_usuario_fk"     FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "gastos"               ADD CONSTRAINT "gastos_usuario_fk"      FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "prestamos"            ADD CONSTRAINT "prestamos_usuario_fk"   FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "goals"                ADD CONSTRAINT "goals_usuario_fk"       FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "transacciones"        ADD CONSTRAINT "tx_usuario_fk"          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "eventos_activo"       ADD CONSTRAINT "eventos_usuario_fk"     FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "conexiones"           ADD CONSTRAINT "conexiones_usuario_fk"  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "settings"             ADD CONSTRAINT "settings_usuario_fk"    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
ALTER TABLE "prestamos_personales" ADD CONSTRAINT "fiado_usuario_fk"       FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Los unique globales pasan a ser por usuario. Si quedaran globales, el
-- periodo "2026-08" de una persona chocaria con el de otra y la segunda no
-- podria cargar su propio mes.
ALTER TABLE "statements"    DROP CONSTRAINT IF EXISTS "statements_file_id_unique";
ALTER TABLE "salaries"      DROP CONSTRAINT IF EXISTS "salaries_periodo_unique";
ALTER TABLE "monthly_closes" DROP CONSTRAINT IF EXISTS "monthly_closes_periodo_unique";
ALTER TABLE "gastos"        DROP CONSTRAINT IF EXISTS "gastos_file_id_unique";
ALTER TABLE "transacciones" DROP CONSTRAINT IF EXISTS "transacciones_ref_externa_unique";
DROP INDEX IF EXISTS "snapshot_periodo_plataforma";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "statement_usuario_file"       ON "statements" ("usuario_id", "file_id");
CREATE UNIQUE INDEX IF NOT EXISTS "salary_usuario_periodo"       ON "salaries" ("usuario_id", "periodo");
CREATE UNIQUE INDEX IF NOT EXISTS "cierre_usuario_periodo"       ON "monthly_closes" ("usuario_id", "periodo");
CREATE UNIQUE INDEX IF NOT EXISTS "gasto_usuario_file"           ON "gastos" ("usuario_id", "file_id");
CREATE UNIQUE INDEX IF NOT EXISTS "transaccion_usuario_ref"      ON "transacciones" ("usuario_id", "ref_externa");
CREATE UNIQUE INDEX IF NOT EXISTS "snapshot_periodo_plataforma"  ON "portfolio_snapshots" ("usuario_id", "periodo", "plataforma");
--> statement-breakpoint

-- settings pasa a tener clave compuesta: dos personas tienen cada una su
-- "tipoCambioArs" y con `clave` sola una pisaria a la otra.
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_pkey";
ALTER TABLE "settings" ADD PRIMARY KEY ("usuario_id", "clave");
