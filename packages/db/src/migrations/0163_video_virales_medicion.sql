-- Virales de Latinoamérica medidos por lmtm-redes (plan 17/11, fase 1): de TikTok e Instagram, con vistas y la
-- mediana de SU autor. Los que no son de la competencia de un cliente no están en competencia_posts, así que los números
-- van en la fila. control = video NORMAL del mismo autor (para comparar contra el viral). fuente nueva: 'estudio'.
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "red" text;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "pais" text;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "vistas" bigint;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "me_gusta" integer;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "comentarios" integer;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "compartidos" integer;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "guardados" integer;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "mediana_autor" real;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "veces" real;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "publicado" date;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "texto" text;
ALTER TABLE "video_virales" ADD COLUMN IF NOT EXISTS "control" boolean DEFAULT false NOT NULL;
