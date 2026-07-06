-- LMTM-OS: Baúl de Ganchos + Tendencias.
-- hooks: reusable hook vault — every hook worth keeping (from own top posts,
-- competitor reels, trends or manual saves), searchable by niche/type, with a
-- use counter so the best ones surface.
-- trends: daily AI/industry news mined by the agents from external sources,
-- tagged by content potential and the niches they apply to.

CREATE TABLE IF NOT EXISTS hooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE,  -- null = global (niche-level)
  niche       text,
  text        text NOT NULL,                 -- the hook itself
  source_kind text NOT NULL DEFAULT 'manual', -- manual | organico | competidor | tendencia
  source_ref  text,                          -- creator handle / post url / task id
  format      text,                          -- reel | carrusel | story | estatico
  views       bigint,                        -- views of the piece it came from (if known)
  times_used  integer NOT NULL DEFAULT 0,
  pinned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hooks_client_idx ON hooks (client_id);
CREATE INDEX IF NOT EXISTS hooks_niche_idx ON hooks (niche);

CREATE TABLE IF NOT EXISTS trends (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day        text NOT NULL,                  -- YYYY-MM-DD
  title      text NOT NULL,
  url        text,
  source     text,                           -- which of the sources it came from
  tag        text NOT NULL DEFAULT 'potencial-de-gancho', -- potencial-de-gancho | explicativo | ignorar
  niches     jsonb NOT NULL DEFAULT '[]',    -- niches this trend is useful for
  summary    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trends_day_idx ON trends (day);
