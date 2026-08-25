CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"monto_objetivo" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'USD' NOT NULL,
	"fecha_objetivo" text,
	"notas" text,
	"archivada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
