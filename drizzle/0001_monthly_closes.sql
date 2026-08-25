CREATE TABLE "monthly_closes" (
	"id" text PRIMARY KEY NOT NULL,
	"periodo" text NOT NULL,
	"ingreso_ars" numeric(14, 2) NOT NULL,
	"gasto_ars" numeric(14, 2) NOT NULL,
	"gasto_usd" numeric(10, 2) NOT NULL,
	"percep_ars" numeric(14, 2) NOT NULL,
	"ahorro_ars" numeric(14, 2) NOT NULL,
	"tasa_ahorro" numeric(6, 2),
	"por_categoria" jsonb NOT NULL,
	"calculado_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_closes_periodo_unique" UNIQUE("periodo")
);
