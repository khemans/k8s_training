-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Migration 008: Interview scheduling
--  Add interview_at to saved_jobs for calendar feature
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.saved_jobs
  ADD COLUMN IF NOT EXISTS interview_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_interview_at
  ON public.saved_jobs(user_id, interview_at)
  WHERE interview_at IS NOT NULL;
