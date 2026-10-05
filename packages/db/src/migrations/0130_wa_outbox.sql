-- Embudo unico de salida de WhatsApp al equipo.
--
-- Antes: 14 modulos llamaban `sendWhatsAppToNumber(alertsNumber(), ...)` directo.
-- Sin nivel, sin tope y sin registro: nadie podia medir cuanto manda el sistema,
-- y una caida real entraba en el mismo chorro que un aviso rutinario. Resultado
-- concreto: Distrillantas se desconecto entero y nadie se entero.
--
-- Esta tabla es el registro de TODO lo que el sistema quiso mandarle al equipo,
-- se haya mandado o no. El `motivo` dice por que no se mando; el `origen`
-- permite, a la semana, ver que modulo genera volumen y apagarlo con dato.
CREATE TABLE IF NOT EXISTS "wa_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "destino" text NOT NULL,
  "nivel" integer NOT NULL DEFAULT 3,
  "origen" text NOT NULL,
  "clave" text NOT NULL,
  "client_id" uuid,
  "texto" text NOT NULL,
  "estado" text NOT NULL DEFAULT 'pendiente',
  "motivo" text,
  "enviado_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- El digest barre por estado+fecha.
CREATE INDEX IF NOT EXISTS "wa_outbox_estado_idx" ON "wa_outbox" ("estado","created_at");
-- El dedupe pregunta por clave en las ultimas 24h.
CREATE INDEX IF NOT EXISTS "wa_outbox_clave_idx" ON "wa_outbox" ("clave","created_at");
-- El reporte de ruido agrupa por origen.
CREATE INDEX IF NOT EXISTS "wa_outbox_origen_idx" ON "wa_outbox" ("origen","created_at");
