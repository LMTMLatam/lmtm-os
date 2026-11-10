-- «Tipos de video» (09/11): virales por nicho y tipo de video, y plantillas de edición. Aditiva.
CREATE TABLE IF NOT EXISTS "video_tipos" (
  "slug" text PRIMARY KEY NOT NULL,
  "nombre" text NOT NULL,
  "descripcion" text DEFAULT '' NOT NULL,
  "orden" integer DEFAULT 100 NOT NULL,
  "activo" boolean DEFAULT true NOT NULL
);
INSERT INTO "video_tipos" ("slug", "nombre", "descripcion", "orden") VALUES
  ('habla-a-camara', 'Habla a cámara', 'Una persona le habla a la cámara: presentación, opinión o consejo.', 10),
  ('recorrido', 'Recorrido', 'Se recorre un lugar: propiedad, local, hotel, obra o planta.', 20),
  ('producto', 'Producto', 'Muestra o demostración de un producto.', 30),
  ('testimonio', 'Testimonio', 'Un cliente real cuenta su experiencia.', 40),
  ('tutorial', 'Tutorial', 'Enseña cómo se hace o cómo se usa algo, paso a paso.', 50),
  ('antes-y-despues', 'Antes y después', 'Compara el estado inicial con el resultado.', 60),
  ('detras-de-escena', 'Detrás de escena', 'El proceso, el equipo o el día a día.', 70),
  ('tendencia', 'Tendencia', 'Usa un audio, un formato o un meme del momento.', 80),
  ('promo', 'Promo', 'Oferta, descuento o lanzamiento con fecha.', 90),
  ('evento', 'Evento', 'Cobertura de un evento, una feria o una inauguración.', 100)
ON CONFLICT ("slug") DO NOTHING;

-- El tipo de video de cada publicación de la competencia lo pone un modelo leyendo el texto, una sola vez.
ALTER TABLE "competencia_posts" ADD COLUMN IF NOT EXISTS "tipo_video" text;
ALTER TABLE "competencia_posts" ADD COLUMN IF NOT EXISTS "tipo_video_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "video_virales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url" text NOT NULL,
  "cuenta" text NOT NULL,
  "nicho" text NOT NULL,
  "tipo" text NOT NULL,
  "fuente" text DEFAULT 'equipo' NOT NULL,
  "autor" text,
  "post_id" text,
  "gancho" text,
  "notas" text,
  "forma" jsonb,
  "respuestas" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_virales_url_idx" ON "video_virales" ("url");
CREATE INDEX IF NOT EXISTS "video_virales_nicho_tipo_idx" ON "video_virales" ("nicho", "tipo");

CREATE TABLE IF NOT EXISTS "video_plantillas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nicho" text NOT NULL,
  "tipo" text NOT NULL,
  "version" integer NOT NULL,
  "estado" text DEFAULT 'borrador' NOT NULL,
  "contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidencia" jsonb DEFAULT '{"virales":0,"cuentas":0,"ids":[]}'::jsonb NOT NULL,
  "autor" text NOT NULL,
  "motivo" text,
  "aprobada_por" text,
  "aprobada_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_plantillas_version_idx" ON "video_plantillas" ("nicho", "tipo", "version");
