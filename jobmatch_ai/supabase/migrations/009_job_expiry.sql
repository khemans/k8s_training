-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Migration 009: Job expiry
--  Add expires_at to jobs table for TTL-based auto-expiry
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Index for the daily cleanup query and feed filter
CREATE INDEX IF NOT EXISTS idx_jobs_expiry
  ON public.jobs(is_active, expires_at)
  WHERE is_active = TRUE;

-- Backfill existing jobs: set expires_at = scraped_at + 30 days
-- Jobs already older than 30 days will be caught by the next cleanup run
UPDATE public.jobs
SET expires_at = scraped_at + INTERVAL '30 days'
WHERE expires_at IS NULL
  AND source != 'imported';  -- imported/pasted jobs never expire
