-- Lock global de Higgsfield (17/8).
--
-- Reemplaza a pg_advisory_lock, que NO sirve sobre un pool: el lock es de la
-- SESIÓN, así que tomar y liberar pueden caer en conexiones distintas. Cuando
-- eso pasa, pg_advisory_unlock devuelve false SIN error (el .catch nunca salta)
-- y la conexión vuelve al pool con el lock puesto para siempre. Verificado hoy:
-- una conexión idle sirviendo queries de feedback_exports tenía tomado el
-- objid 771533901.
--
-- Una fila con vencimiento no depende de la conexión y se cura sola si el
-- proceso muere sin liberar.
CREATE TABLE IF NOT EXISTS higgsfield_lock (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  holder TEXT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

INSERT INTO higgsfield_lock (id, holder, expires_at)
VALUES (TRUE, NULL, now() - INTERVAL '1 minute')
ON CONFLICT (id) DO NOTHING;
