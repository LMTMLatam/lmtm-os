-- Informes semanales para el cliente: la narrativa del estratega, los numeros
-- de la semana con los que se escribio y lo que dijo el auditor.
--
-- El problema: lo que salia hacia el cliente no servia para mandarselo (CTR
-- suelto, numeros de otra ventana, datos de otro cliente). Ahora el agente
-- escribe sin numeros (usa marcadores), el servidor los completa desde las
-- metricas de esa semana y guarda la foto en `numeros`: lo que se audito es
-- lo que se publica, aunque despues la ingesta corrija un dia.
--
-- Estados: borrador (recien escrito) -> observado (el auditor encontro algo)
-- o aprobado (paso el auditor) -> publicado (una persona lo publico; es lo
-- unico que ve el cliente en su link).
--
-- Aditiva: tabla nueva, no toca ninguna existente.
CREATE TABLE IF NOT EXISTS "informes_semanales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "semana" date NOT NULL,
  "narrativa" jsonb NOT NULL,
  "numeros" jsonb NOT NULL,
  "estado" text NOT NULL DEFAULT 'borrador',
  "escrito_por" text NOT NULL,
  "auditoria" jsonb,
  "publicado_at" timestamp with time zone,
  "publicado_por" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "informes_semanales_estado_ck" CHECK ("estado" IN ('borrador', 'observado', 'aprobado', 'publicado')),
  CONSTRAINT "informes_semanales_escrito_por_ck" CHECK ("escrito_por" ~ '^(agente|tablero):.+'),
  -- Publicado exige quien y cuando: es lo que ve el cliente.
  CONSTRAINT "informes_semanales_publicado_ck" CHECK ("estado" <> 'publicado' OR ("publicado_at" IS NOT NULL AND "publicado_por" IS NOT NULL)),
  -- La semana arranca un lunes: un informe habla de una semana entera.
  CONSTRAINT "informes_semanales_lunes_ck" CHECK (extract(isodow from "semana") = 1)
);
--> statement-breakpoint
-- Un informe por cliente y semana: reescribirlo lo reemplaza.
CREATE UNIQUE INDEX IF NOT EXISTS "informes_semanales_cliente_semana_uq" ON "informes_semanales" ("client_id", "semana");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "informes_semanales_estado_idx" ON "informes_semanales" ("estado", "semana");
