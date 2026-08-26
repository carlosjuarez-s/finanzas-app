CREATE TABLE "eventos_activo" (
	"id" text PRIMARY KEY NOT NULL,
	"activo" text NOT NULL,
	"fecha" text NOT NULL,
	"tipo" text NOT NULL,
	"factor" numeric(14, 6) NOT NULL,
	"notas" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transacciones" (
	"id" text PRIMARY KEY NOT NULL,
	"activo" text NOT NULL,
	"clase" text NOT NULL,
	"tipo" text NOT NULL,
	"fecha" text NOT NULL,
	"cantidad" numeric(20, 8) NOT NULL,
	"precio_unitario" numeric(20, 8) NOT NULL,
	"moneda" text NOT NULL,
	"tipo_cambio_dia" numeric(14, 4),
	"comision" numeric(20, 8) DEFAULT '0' NOT NULL,
	"origen" text NOT NULL,
	"ref_externa" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transacciones_ref_externa_unique" UNIQUE("ref_externa")
);
