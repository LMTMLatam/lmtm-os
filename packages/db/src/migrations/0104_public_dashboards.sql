-- 0104: Public dashboard tokens
-- A read-only "view key" that lets the agency's client open the dashboard
-- without a login. No expiration by design (the user can revoke by
-- deleting the row or toggling `enabled`).

CREATE TABLE IF NOT EXISTS "public_dashboards" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "slug" TEXT NOT NULL,
  "label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_viewed_at" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS "public_dashboards_slug_uq" ON "public_dashboards"("slug");
CREATE INDEX IF NOT EXISTS "public_dashboards_client_idx" ON "public_dashboards"("client_id");
CREATE INDEX IF NOT EXISTS "public_dashboards_enabled_idx" ON "public_dashboards"("enabled");
