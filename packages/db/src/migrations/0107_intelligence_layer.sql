-- LMTM-OS: intelligence layer — Customer Brain, scores, feedback, content
-- knowledge graph, cumulative learnings and creative opportunities.
-- All statements are idempotent so the migration can re-run safely.

-- 1. Customer Brain: living per-client memory.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='client_memory') THEN
    CREATE TABLE "client_memory" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "key" text NOT NULL,
      "content" text NOT NULL,
      "source" text,
      "confidence" numeric(4,3) NOT NULL DEFAULT 0.7,
      "pinned" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_memory_client_kind_key_idx" ON "client_memory" ("client_id","kind","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_memory_client_idx" ON "client_memory" ("client_id");
--> statement-breakpoint

-- 2. Account scores: operational + health, with history.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_scores') THEN
    CREATE TABLE "account_scores" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
      "date" text NOT NULL,
      "health_score" integer NOT NULL DEFAULT 0,
      "ops_score" integer NOT NULL DEFAULT 0,
      "components" jsonb NOT NULL DEFAULT '{}',
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_scores_client_date_idx" ON "account_scores" ("client_id","date");
--> statement-breakpoint

-- 3. Feedback items: captured + classified + routed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='feedback_items') THEN
    CREATE TABLE "feedback_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL,
      "source" text NOT NULL,
      "raw_text" text NOT NULL,
      "classification" text,
      "sentiment" text,
      "routed_issue_id" uuid,
      "status" text NOT NULL DEFAULT 'new',
      "external_ref" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_items_external_idx" ON "feedback_items" ("external_ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_client_idx" ON "feedback_items" ("client_id");
--> statement-breakpoint

-- 4. Content performance: knowledge graph of content <-> results.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_performance') THEN
    CREATE TABLE "content_performance" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE,
      "content_ref" text NOT NULL,
      "source" text NOT NULL,
      "title" text,
      "format" text,
      "tags" jsonb NOT NULL DEFAULT '[]',
      "published_at" timestamp with time zone,
      "metrics" jsonb NOT NULL DEFAULT '{}',
      "score" numeric(8,2),
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_perf_ref_idx" ON "content_performance" ("content_ref","source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_perf_client_idx" ON "content_performance" ("client_id");
--> statement-breakpoint

-- 5. Learnings: cumulative cross-client/niche patterns.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='learnings') THEN
    CREATE TABLE "learnings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "scope" text NOT NULL,
      "scope_key" text,
      "pattern" text NOT NULL,
      "evidence" jsonb NOT NULL DEFAULT '{}',
      "metric_impact" text,
      "confidence" numeric(4,3) NOT NULL DEFAULT 0.5,
      "occurrences" integer NOT NULL DEFAULT 1,
      "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learnings_scope_pattern_idx" ON "learnings" ("scope","scope_key","pattern");
--> statement-breakpoint

-- 6. Opportunities: creative/operational opportunities engine output.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opportunities') THEN
    CREATE TABLE "opportunities" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "title" text NOT NULL,
      "rationale" text,
      "suggested_action" text,
      "basis" jsonb NOT NULL DEFAULT '{}',
      "priority" integer NOT NULL DEFAULT 0,
      "status" text NOT NULL DEFAULT 'new',
      "external_ref" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_dedup_idx" ON "opportunities" ("client_id","kind","title");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_client_idx" ON "opportunities" ("client_id");
