-- La competencia medida (8/10).
--
-- Había 485 competidores cargados (nombre, usuario de Instagram y una nota
-- escrita a mano o por un agente: "muy buen contenido en reels") y nadie medía
-- qué publicaban. Con Business Discovery de Instagram se leen sus
-- publicaciones públicas con me gusta y comentarios, con la misma conexión de
-- Meta que ya tenemos. Así los rubros sin cuentas propias medidas (hoteles,
-- materiales) tienen con qué comparar.
--
-- Aditiva: tres columnas nullable y una tabla nueva. Las publicaciones son por
-- usuario de Instagram, no por fila de competidor: dos clientes pueden tener al
-- mismo competidor y se mide una sola vez.
ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "ig_estado" text;
ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "ig_seguidores" integer;
ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "ig_revisado_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "competencia_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "usuario" text NOT NULL,
  "texto" text,
  "formato" text,
  "me_gusta" integer,
  "comentarios" integer,
  "publicado_at" timestamp with time zone NOT NULL,
  "permalink" text,
  "angulo" text,
  "angulo_at" timestamp with time zone,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "competencia_posts_usuario_idx" ON "competencia_posts" ("usuario", "publicado_at");
