CREATE TABLE "consumos" (
	"id" text PRIMARY KEY NOT NULL,
	"statement_id" text NOT NULL,
	"fecha" text NOT NULL,
	"comercio" text NOT NULL,
	"categoria" text NOT NULL,
	"cuota" text,
	"monto_ars" numeric(14, 2) NOT NULL,
	"monto_usd" numeric(10, 2) NOT NULL
);
CREATE TABLE "portfolio_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"periodo" text NOT NULL,
	"plataforma" text NOT NULL,
	"total_usd" numeric(14, 2),
	"total_ars" numeric(16, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"activo" text NOT NULL,
	"clase" text NOT NULL,
	"cantidad" numeric(20, 8) NOT NULL,
	"valor_usd" numeric(14, 2),
	"valor_ars" numeric(16, 2)
);
CREATE TABLE "salaries" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"periodo" text NOT NULL,
	"neto_ars" numeric(14, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salaries_periodo_unique" UNIQUE("periodo")
);
CREATE TABLE "statements" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"card" text NOT NULL,
	"periodo" text NOT NULL,
	"vencimiento" timestamp,
	"total_ars" numeric(14, 2) NOT NULL,
	"total_usd" numeric(10, 2) NOT NULL,
	"percep_ars" numeric(14, 2) NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "statements_file_id_unique" UNIQUE("file_id")
);
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "positions" ADD CONSTRAINT "positions_snapshot_id_portfolio_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."portfolio_snapshots"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "snapshot_periodo_plataforma" ON "portfolio_snapshots" USING btree ("periodo","plataforma");
