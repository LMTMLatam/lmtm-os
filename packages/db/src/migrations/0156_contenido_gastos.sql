-- Lo que gasta cada generación de contenido (11/10).
--
-- Pedido: "que se guarden los tokens gastados de la herramienta que haya sido
-- utilizada; necesitamos tener control sobre cómo fueron utilizados". Una fila
-- por generación PAGADA (cada clip de un reel, cada placa de un carrusel),
-- aunque la pieza después no se entregue: así se ve también lo que se pagó y se
-- perdió. Las unidades no se mezclan entre herramientas: los créditos del plan
-- de Higgsfield, los de su API y Magnific son bolsas distintas.
--
-- creditos/usd null = la herramienta no informó el costo. Nunca 0 por defecto.
CREATE TABLE IF NOT EXISTS "contenido_gastos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "client_id" uuid,
  "pieza" text,
  "origen" text NOT NULL,
  "herramienta" text NOT NULL,
  "modelo" text,
  "tipo" text NOT NULL,
  "creditos" numeric,
  "usd" numeric,
  "url" text,
  "job_id" text
);
CREATE INDEX IF NOT EXISTS "contenido_gastos_fecha_idx" ON "contenido_gastos" ("created_at");
CREATE INDEX IF NOT EXISTS "contenido_gastos_pieza_idx" ON "contenido_gastos" ("pieza");
