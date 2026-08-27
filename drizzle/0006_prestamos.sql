CREATE TABLE IF NOT EXISTS "prestamos" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"entidad" text,
	"monto_otorgado" numeric(14, 2),
	"cuotas" numeric(5, 0) NOT NULL,
	"cuota_ars" numeric(14, 2) NOT NULL,
	"primer_periodo" text NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"cft_anual" numeric(8, 2),
	"cancelado_en" text,
	"notas" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
