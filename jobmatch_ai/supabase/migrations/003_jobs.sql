-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Migration 003: Jobs table
--  Phase 1 — Job Scraping Pipeline
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  location        TEXT,
  description     TEXT,
  source          TEXT NOT NULL,            -- 'indeed' | 'glassdoor' | 'ziprecruiter' | 'wellfound'
  source_url      TEXT NOT NULL,
  career_page_url TEXT,                     -- resolved ATS/company careers URL
  salary_range    JSONB DEFAULT '{}',       -- { min, max, currency, period }
  posted_at       TIMESTAMPTZ,
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE,
  dedup_hash      TEXT UNIQUE NOT NULL      -- SHA-256(lower(title + company + location))
);

CREATE INDEX IF NOT EXISTS idx_jobs_source     ON public.jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at  ON public.jobs(posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active  ON public.jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at ON public.jobs(scraped_at DESC);
-- Full-text search index over title + company
CREATE INDEX IF NOT EXISTS idx_jobs_fts ON public.jobs
  USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(company,'') || ' ' || coalesce(description,'')));
