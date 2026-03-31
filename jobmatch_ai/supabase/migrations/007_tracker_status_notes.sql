-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Migration 007: Application tracker (Kanban)
--  Add status, applied_at, notes to saved_jobs
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.saved_jobs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'saved'
    CHECK (status IN ('saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected')),
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_status ON public.saved_jobs(user_id, status);
