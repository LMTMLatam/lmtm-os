-- Google Search Console y Google Analytics 4 por cliente (13/10). Aditiva.
-- La cuenta de Google que dio permiso (una fila por cuenta: el equipo puede
-- tener propiedades repartidas en más de una).
CREATE TABLE IF NOT EXISTS "google_web_conexiones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "email" text NOT NULL,
  "refresh_token" text NOT NULL,
  "scopes" text[],
  "estado" text DEFAULT 'activa' NOT NULL,
  "ultimo_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "google_web_conexiones_cuenta_idx" ON "google_web_conexiones" ("company_id", "email");

-- Qué sitio de Search Console y qué propiedad de GA4 son de cada cliente.
-- fijada_por null = la eligió el sistema por la web del cliente; si la eligió
-- una persona, la búsqueda automática no la toca.
CREATE TABLE IF NOT EXISTS "web_propiedades" (
  "client_id" uuid PRIMARY KEY NOT NULL,
  "gsc_sitio" text,
  "ga4_propiedad" text,
  "ga4_nombre" text,
  "fijada_por" text,
  "ultimo_error" text,
  "sincronizado_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Un día de un cliente. null = esa fuente no está conectada o no informó: nunca 0.
CREATE TABLE IF NOT EXISTS "web_diario" (
  "client_id" uuid NOT NULL,
  "fecha" date NOT NULL,
  "gsc_clics" integer,
  "gsc_impresiones" integer,
  "gsc_posicion" numeric,
  "ga_sesiones" integer,
  "ga_usuarios" integer,
  "ga_nuevos" integer,
  "ga_comprometidas" integer,
  "ga_eventos_clave" numeric,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("client_id", "fecha")
);

-- Lo más buscado, las páginas, los canales y las landings de una ventana de
-- 28 días. Se reemplaza entero por (cliente, tipo) en cada sincronización.
CREATE TABLE IF NOT EXISTS "web_ranking" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "clave" text NOT NULL,
  "detalle" text,
  "desde" date NOT NULL,
  "hasta" date NOT NULL,
  "clics" integer,
  "impresiones" integer,
  "posicion" numeric,
  "sesiones" integer,
  "usuarios" integer,
  "eventos_clave" numeric,
  "compromiso" numeric
);
CREATE INDEX IF NOT EXISTS "web_ranking_cliente_tipo_idx" ON "web_ranking" ("client_id", "tipo");
