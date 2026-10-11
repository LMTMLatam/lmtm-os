-- Competidores que solo tienen Facebook (11/10): 320 de 502. Se leen con
-- ScrapeCreators (services/scrapecreators.ts); el estado de esa lectura va
-- aparte del de Instagram. Aditiva, columnas nullable.
ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "fb_estado" text;
ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "fb_revisado_at" timestamp with time zone;
