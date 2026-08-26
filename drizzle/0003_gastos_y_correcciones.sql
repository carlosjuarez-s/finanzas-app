CREATE TABLE "gastos" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text,
	"periodo" text NOT NULL,
	"fecha" text,
	"concepto" text NOT NULL,
	"categoria" text NOT NULL,
	"monto_ars" numeric(14, 2) NOT NULL,
	"monto_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"origen" text NOT NULL,
	"corregido" boolean DEFAULT false NOT NULL,
	"notas" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gastos_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "consumos" ADD COLUMN "corregido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salaries" ADD COLUMN "corregido" boolean DEFAULT false NOT NULL;