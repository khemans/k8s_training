-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Migration 004: Scrape sources health table
--  Phase 1 — Job Scraping Pipeline
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scrape_sources (
  id           SERIAL PRIMARY KEY,
  source       TEXT UNIQUE NOT NULL,
  last_run_at  TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  error_count  INTEGER DEFAULT 0,
  is_healthy   BOOLEAN DEFAULT TRUE,
  status_note  TEXT
);

INSERT INTO public.scrape_sources (source) VALUES
  ('indeed'),
  ('glassdoor'),
  ('ziprecruiter'),
  ('wellfound')
ON CONFLICT (source) DO NOTHING;
