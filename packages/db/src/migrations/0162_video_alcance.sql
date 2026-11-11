-- «Producción → Tipos de video» (11/11): tipos de video propios de un rubro o de un cliente.
-- alcance = 'todos' | '<rubro>' | 'cliente:<slug>'. Las plantillas usan la misma clave en video_plantillas.nicho.
ALTER TABLE "video_tipos" ADD COLUMN IF NOT EXISTS "alcance" text DEFAULT 'todos' NOT NULL;
ALTER TABLE "video_tipos" ADD COLUMN IF NOT EXISTS "creado_por" text;
