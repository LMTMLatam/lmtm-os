-- Cómo rindió cada pieza del Productor a las 24 h y a los 7 días (02/11). Aditiva.
-- organic_post_insights pisa el valor en cada sync: sin esta foto no se puede comparar el
-- mismo momento entre piezas. null = sin dato, nunca cero.
CREATE TABLE IF NOT EXISTS "pieza_metricas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deliverable_id" uuid NOT NULL REFERENCES "agent_deliverables"("id") ON DELETE CASCADE,
  "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE,
  "post_id" text NOT NULL,
  "momento" text NOT NULL,
  "horas" integer NOT NULL,
  "reacciones" integer,
  "comentarios" integer,
  "compartidos" integer,
  "alcance" integer,
  "vistas" integer,
  "guardados" integer,
  "nota" text,
  "medido_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pieza_metricas_pieza_momento_idx" ON "pieza_metricas" ("deliverable_id", "momento");
CREATE INDEX IF NOT EXISTS "pieza_metricas_cliente_idx" ON "pieza_metricas" ("client_id");
