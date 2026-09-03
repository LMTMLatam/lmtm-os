-- Productos por cliente + avatar de marca (pedido 14/8).
--
-- El equipo carga acá los productos (nombre + foto + descripción) y el avatar
-- de la marca. Los agentes lo usan como referencia al generar placas, carruseles
-- y videos: sin esto el modelo inventa el producto.

CREATE TABLE IF NOT EXISTS "client_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  -- URL pública/Drive de la foto del producto. La imagen vive en Drive
  -- (super redes/<cliente>/PRODUCTOS), acá guardamos el link directo.
  "image_url" text,
  "drive_file_id" text,
  -- Orden de aparición en la ficha; los más nuevos al final.
  "position" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "client_products_client_idx" ON "client_products" ("client_id", "position");

-- Avatar de marca del cliente (una imagen de referencia para el estilo).
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "avatar_url" text;
