-- Identidad de marca por cliente (18/8).
--
-- La pestaña "Productos" tenía solo el catálogo, y el resto de la identidad
-- estaba desparramada: el avatar en clients.avatar_url, la voz de marca en
-- client_memory (key 'voz-de-marca', solo 5 clientes), los colores en ningún
-- lado. Los agentes que generan contenido no tenían de dónde sacar la paleta ni
-- el tono, así que las piezas salían genéricas.
--
-- Todo junto en una fila por cliente: es lo que lee el generador de placas y el
-- de ideas, y lo que carga el equipo en la pestaña Marca.
CREATE TABLE IF NOT EXISTS client_brand (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  -- Logo y avatar: el logo es la marca, el avatar es la cara/imagen de
  -- referencia con la que se generan las piezas. No siempre son lo mismo.
  logo_url TEXT,
  -- Paleta en hex, en orden de importancia. El primero es el color principal.
  colores JSONB NOT NULL DEFAULT '[]'::jsonb,
  tipografias JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Cómo habla la marca: tono, palabras que usa y que evita.
  tono TEXT,
  palabras_si JSONB NOT NULL DEFAULT '[]'::jsonb,
  palabras_no JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Qué quiere comunicar: la promesa central y a quién le habla.
  mensaje TEXT,
  publico TEXT,
  diferencial TEXT,
  notas TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
