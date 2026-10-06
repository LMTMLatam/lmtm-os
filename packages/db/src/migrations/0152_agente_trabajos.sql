-- Cola de trabajos del runner propio de agentes (fase C2).
--
-- El problema: los agentes corrían despertados por heartbeats e issues de
-- paperclip. De 698 corridas por reloj en 14 días, ninguna tenía trabajo, y lo
-- que hacían quedaba en comentarios de tickets que nadie leía. Acá cada trabajo
-- nace de un hecho (una decisión nueva, un horario, un pedido), queda una fila
-- con lo que entró, cada paso que dio el agente y lo que encontró, y la
-- interfaz lee de acá.
--
-- Estados: pendiente -> corriendo -> hecho | fallo | cancelado.
--
-- Aditiva: tabla nueva, no toca ninguna existente.
CREATE TABLE IF NOT EXISTS "agente_trabajos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rol" text NOT NULL,
  "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE,
  "motivo" text NOT NULL,
  "ref" text,
  "entrada" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "estado" text NOT NULL DEFAULT 'pendiente',
  "resultado" jsonb,
  "pasos" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error" text,
  "turnos" integer,
  "tokens_entrada" integer,
  "tokens_salida" integer,
  "intentos" integer NOT NULL DEFAULT 0,
  "pedido_por" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "agente_trabajos_estado_ck" CHECK ("estado" IN ('pendiente', 'corriendo', 'hecho', 'fallo', 'cancelado')),
  CONSTRAINT "agente_trabajos_motivo_ck" CHECK ("motivo" IN ('decision', 'horario', 'pedido'))
);
--> statement-breakpoint
-- El mismo hecho no se trabaja dos veces: una decisión se investiga una vez
-- (salvo que haya fallado, que se puede reintentar).
CREATE UNIQUE INDEX IF NOT EXISTS "agente_trabajos_ref_uq" ON "agente_trabajos" ("rol", "ref") WHERE "ref" IS NOT NULL AND "estado" IN ('pendiente', 'corriendo', 'hecho');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agente_trabajos_cola_idx" ON "agente_trabajos" ("estado", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agente_trabajos_cliente_idx" ON "agente_trabajos" ("client_id", "created_at");
