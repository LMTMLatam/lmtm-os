-- Ángulo de cada publicación orgánica (pedido 7/10: comparar ángulos entre
-- todas las cuentas y reutilizar lo que funciona).
--
-- Lo completa un clasificador (services/contenido-angulos.ts) con la lista de
-- ángulos de angulos-creativos.ts. NULL = todavía sin clasificar.
--
-- Aditiva: dos columnas nuevas, nullable. El sync de Meta no las toca.
ALTER TABLE "organic_posts" ADD COLUMN IF NOT EXISTS "angulo" text;
ALTER TABLE "organic_posts" ADD COLUMN IF NOT EXISTS "angulo_at" timestamp with time zone;
