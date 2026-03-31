-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Migration 006: Job matches table
--  Phase 2 — Job Matching + UI
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_matches (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  resume_id           UUID NOT NULL REFERENCES public.resume_profiles(id) ON DELETE CASCADE,
  match_score         INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_explanation   TEXT,
  skills_gap          JSONB DEFAULT '[]',     -- list of missing skill strings
  resume_suggestions  JSONB DEFAULT '[]',     -- list of bullet suggestion strings
  raw_response        JSONB,                  -- full Claude response for debugging
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, job_id, resume_id)         -- one analysis per user+job+resume combo
);

CREATE INDEX IF NOT EXISTS idx_job_matches_user_id   ON public.job_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_job_id    ON public.job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_score     ON public.job_matches(match_score DESC);

-- ── Saved jobs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  saved_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON public.saved_jobs(user_id);
