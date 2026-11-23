-- La web de cada competidor (pedido de Marcos 23/11: «nutrir la competencia»): título, descripción y encabezados de
-- su portada, para saber qué términos trabaja y cruzarlos con Search Console y las keywords del cliente.
-- Por dominio, no por fila de competidor: varios clientes comparten competidor.
CREATE TABLE IF NOT EXISTS "competencia_webs" (
  "host" text PRIMARY KEY,
  "titulo" text,
  "descripcion" text,
  "encabezados" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "estado" text NOT NULL,
  "revisado_at" timestamp with time zone DEFAULT now() NOT NULL
);
