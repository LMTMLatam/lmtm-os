-- Decisiones: el lugar unico donde las reglas y los agentes dejan "hay que
-- hacer esto", con el numero que lo justifica y la plata por dia en juego.
--
-- Antes la decision estaba repartida en cinco modulos (informe ejecutivo,
-- costo de no hacer, plan de accion, cartera, cola humana), cada uno con su
-- lista. El jefe no tenia donde decidir. Esta tabla es lo que lee la pantalla
-- Hoy.
--
-- Columnas de PLAN.md mas tres que el ciclo necesita: `clave` (el mismo hecho
-- no abre dos decisiones), `ejecutada_at` (desde cuando mirar el proximo dato
-- para verificar) y `updated_at`.
--
-- Aditiva: tabla nueva, no toca ninguna existente.
CREATE TABLE IF NOT EXISTS "decisiones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL,
  "que" text NOT NULL,
  "porque" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ars_por_dia" numeric(14, 2),
  "responsable" text NOT NULL,
  "estado" text NOT NULL DEFAULT 'abierta',
  "creada_por" text NOT NULL,
  "accion" jsonb,
  "vence_at" timestamp with time zone,
  "motivo_descarte" text,
  "verificada_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "clave" text NOT NULL,
  "ejecutada_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- Los enums del contrato viven en la base: un valor mal escrito desde un
  -- agente rebota aca y no aparece como una decision que ninguna pantalla sabe
  -- mostrar.
  CONSTRAINT "decisiones_responsable_ck" CHECK ("responsable" IN ('equipo', 'cliente', 'agente')),
  CONSTRAINT "decisiones_estado_ck" CHECK ("estado" IN ('abierta', 'aprobada', 'ejecutada', 'verificada', 'descartada', 'vencida')),
  CONSTRAINT "decisiones_creada_por_ck" CHECK ("creada_por" ~ '^(regla|agente):.+'),
  -- Descartar exige motivo: los motivos son lo que despues ajusta las reglas.
  CONSTRAINT "decisiones_descarte_ck" CHECK ("estado" <> 'descartada' OR coalesce(btrim("motivo_descarte"), '') <> ''),
  CONSTRAINT "decisiones_ars_ck" CHECK ("ars_por_dia" IS NULL OR "ars_por_dia" >= 0)
);

-- Una sola decision VIVA por hecho. Las cerradas no cuentan: si el problema
-- vuelve despues de verificado, es una decision nueva.
CREATE UNIQUE INDEX IF NOT EXISTS "decisiones_clave_viva_uq" ON "decisiones" ("clave")
  WHERE "estado" IN ('abierta', 'aprobada', 'ejecutada');
-- Hoy lee lo vivo ordenado por plata.
CREATE INDEX IF NOT EXISTS "decisiones_estado_idx" ON "decisiones" ("estado", "ars_por_dia");
-- La ficha del cliente lee sus decisiones.
CREATE INDEX IF NOT EXISTS "decisiones_cliente_idx" ON "decisiones" ("client_id", "estado");
