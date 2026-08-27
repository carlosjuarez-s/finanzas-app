CREATE TABLE IF NOT EXISTS "prestamos_personales" (
	"id" text PRIMARY KEY NOT NULL,
	"persona" text NOT NULL,
	"concepto" text,
	"monto" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"fecha" text NOT NULL,
	"perdonado" boolean DEFAULT false NOT NULL,
	"notas" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devoluciones" (
	"id" text PRIMARY KEY NOT NULL,
	"prestamo_id" text NOT NULL,
	"fecha" text NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"notas" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devoluciones_prestamo_id_fk" FOREIGN KEY ("prestamo_id")
		REFERENCES "prestamos_personales"("id") ON DELETE CASCADE
);
