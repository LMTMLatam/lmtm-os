-- LMTM-OS: video reference library per client.
-- Curated Instagram/TikTok reels the team wants to riff on for a client's
-- video content. Fed into the content-idea generation so agents/service can
-- propose ideas grounded in the references the team actually likes.

CREATE TABLE IF NOT EXISTS video_references (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE,
  url         text NOT NULL,
  categorias  text[] NOT NULL DEFAULT '{}',   -- e.g. {Viral,Tendencia,Comercial}
  comentario  text,
  source      text NOT NULL DEFAULT 'sheet',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_references_client_idx ON video_references (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS video_references_client_url_uq ON video_references (client_id, url);
