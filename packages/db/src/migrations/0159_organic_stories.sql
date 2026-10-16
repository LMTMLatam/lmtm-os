-- Stories de Instagram (16/10). Aditiva.
-- La API de Meta no las trae en el feed y solo muestra las activas (24 h): se
-- capturan cada 6 horas para saber cuándo salió la última de cada cliente.
-- Tabla propia y no organic_posts: esa la leen el verificador de publicación,
-- "cotizado vs realizado" y las métricas de contenido, y una story contaría
-- como un posteo.
CREATE TABLE IF NOT EXISTS "organic_stories" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE,
  "page_id" text,
  "ig_user_id" text NOT NULL,
  "media_type" text,
  "permalink" text,
  "publicada_at" timestamp with time zone NOT NULL,
  "vista_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "organic_stories_cliente_idx" ON "organic_stories" ("client_id", "publicada_at");
