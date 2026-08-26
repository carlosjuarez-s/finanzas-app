CREATE TABLE "conexiones" (
	"id" text PRIMARY KEY NOT NULL,
	"plataforma" text NOT NULL,
	"etiqueta" text NOT NULL,
	"secreto" jsonb NOT NULL,
	"pista" text NOT NULL,
	"estado" text DEFAULT 'ACTIVA' NOT NULL,
	"ultimo_sync" timestamp,
	"ultimo_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
