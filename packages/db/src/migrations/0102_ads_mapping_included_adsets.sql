-- LMTM-OS: add `included_adsets` jsonb column to ads_account_mappings
-- Lets the user pick a subset of adsets per (ad_account, page) mapping
-- (Make.com-style explicit selection). Empty array = sync all adsets
-- under the ad account (default for backward compat).

ALTER TABLE ads_account_mappings
  ADD COLUMN IF NOT EXISTS included_adsets jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ads_account_mappings_page_idx
  ON ads_account_mappings (company_id, page_id)
  WHERE page_id IS NOT NULL;
