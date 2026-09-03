-- Panel Licitaciones (2026-07-22): oportunidades de Mercado Público (ChileCompra)
CREATE TABLE IF NOT EXISTS "licitaciones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "codigo" text NOT NULL UNIQUE,
  "nombre" text NOT NULL,
  "descripcion" text,
  "organismo" text,
  "region" text,
  "moneda" text,
  "monto_estimado" numeric,
  "fecha_publicacion" timestamp with time zone,
  "fecha_cierre" timestamp with time zone,
  "url" text,
  "estado" text NOT NULL DEFAULT 'candidata',
  "relevancia" text,
  "raw" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "licitaciones_estado_idx" ON "licitaciones" ("estado");
CREATE INDEX IF NOT EXISTS "licitaciones_fecha_cierre_idx" ON "licitaciones" ("fecha_cierre");
