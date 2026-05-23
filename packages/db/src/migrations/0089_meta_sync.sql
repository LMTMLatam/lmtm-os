-- Migration 0089: Meta sync tables (campaigns, adsets, ads, insights, page posts, sync_logs)

DO $$ BEGIN

-- sync_logs
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sync_logs') THEN
  CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES meta_connections(id) ON DELETE CASCADE,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    records_synced INTEGER DEFAULT 0,
    error TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX sync_logs_company_idx ON sync_logs(company_id);
  CREATE INDEX sync_logs_job_idx ON sync_logs(job_name, status);
END IF;

-- meta_campaigns
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_campaigns') THEN
  CREATE TABLE meta_campaigns (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
    ad_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT,
    objective TEXT,
    daily_budget NUMERIC,
    lifetime_budget NUMERIC,
    start_time TIMESTAMPTZ,
    stop_time TIMESTAMPTZ,
    raw JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX meta_campaigns_company_idx ON meta_campaigns(company_id);
  CREATE INDEX meta_campaigns_account_idx ON meta_campaigns(ad_account_id);
END IF;

-- meta_adsets
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_adsets') THEN
  CREATE TABLE meta_adsets (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
    campaign_id TEXT,
    ad_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT,
    daily_budget NUMERIC,
    lifetime_budget NUMERIC,
    raw JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX meta_adsets_company_idx ON meta_adsets(company_id);
  CREATE INDEX meta_adsets_campaign_idx ON meta_adsets(campaign_id);
END IF;

-- meta_ads
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_ads') THEN
  CREATE TABLE meta_ads (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
    adset_id TEXT,
    campaign_id TEXT,
    ad_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT,
    creative_id TEXT,
    raw JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX meta_ads_company_idx ON meta_ads(company_id);
  CREATE INDEX meta_ads_adset_idx ON meta_ads(adset_id);
END IF;

-- meta_ads_insights
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_ads_insights') THEN
  CREATE TABLE meta_ads_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
    ad_account_id TEXT NOT NULL,
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    ad_id TEXT,
    date DATE NOT NULL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    spend NUMERIC(12,2) DEFAULT 0,
    reach INTEGER DEFAULT 0,
    ctr NUMERIC(8,4),
    cpc NUMERIC(10,2),
    cpm NUMERIC(10,2),
    leads INTEGER DEFAULT 0,
    actions JSONB DEFAULT '[]',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX meta_insights_company_idx ON meta_ads_insights(company_id);
  CREATE INDEX meta_insights_date_idx ON meta_ads_insights(date);
  CREATE UNIQUE INDEX meta_insights_uniq ON meta_ads_insights(connection_id, ad_account_id, COALESCE(campaign_id,''), COALESCE(adset_id,''), COALESCE(ad_id,''), date);
END IF;

-- meta_page_posts
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_page_posts') THEN
  CREATE TABLE meta_page_posts (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    message TEXT,
    story TEXT,
    full_picture TEXT,
    permalink_url TEXT,
    created_time TIMESTAMPTZ,
    post_type TEXT,
    raw JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX meta_page_posts_company_idx ON meta_page_posts(company_id);
  CREATE INDEX meta_page_posts_page_idx ON meta_page_posts(page_id);
END IF;

-- meta_post_insights
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_post_insights') THEN
  CREATE TABLE meta_post_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    post_id TEXT REFERENCES meta_page_posts(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    value INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, metric)
  );
END IF;

END $$;
