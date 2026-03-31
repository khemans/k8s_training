# JobMatch AI — Product Requirements Document

**Last Updated:** March 10, 2026
**Version:** 2.0
**Status:** Phase 3 In Progress — Core tracker and resume management complete

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Data Models](#4-data-models)
5. [Phase 1 — Job Feed & Scraping](#5-phase-1--job-feed--scraping)
6. [Phase 2 — Resume & Match Analysis](#6-phase-2--resume--match-analysis)
7. [Phase 3 — Tracker, Cover Letter & Resume Management](#7-phase-3--tracker-cover-letter--resume-management)
8. [Phase 4 — ATS Ingestion Hardening](#8-phase-4--ats-ingestion-hardening)
9. [Phase 5 — Future Features](#9-phase-5--future-features)
10. [File Structure](#10-file-structure)
11. [Deployment](#11-deployment)
12. [Environment Variables](#12-environment-variables)
13. [Known Issues & Decisions Log](#13-known-issues--decisions-log)

---

## 1. Product Overview

JobMatch AI is a full-stack web application that helps job seekers manage their job search using AI. Core capabilities:

- **Job Feed** — Aggregates job listings from multiple sources (JSearch/RapidAPI, future scrapers)
- **Resume Management** — Upload, parse, label, and manage multiple resume profiles; select a default resume used for all scoring
- **Match Analysis** — Claude AI scores each resume against job listings (0–100) with explanation, skills gap, and resume suggestions
- **Application Tracker** — Kanban-style board to track applications by status across the full pipeline
- **Cover Letter Generator** — AI-generated cover letters tailored to a specific job + resume combination
- **URL Import** — Add any job posting to the tracker by pasting a URL; auto-extracts and scores
- **JD Paste Import** — Add a job received by email or without a URL by pasting raw JD text; optionally attach a URL

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL (Railway) |
| Auth | Supabase Auth (JWT) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Job Queue | Redis + ARQ worker |
| Scheduling | APScheduler |
| Resume Parsing | pdfplumber + python-docx |
| Web Scraping | httpx + BeautifulSoup4 + lxml |
| JS Rendering | Playwright (Chromium) — for ATS URL extraction |
| Dev Environment | Docker Compose (db + redis + backend + arq-worker + frontend) |
| Production | Vercel (frontend) + Railway (backend + worker + Redis + Postgres) |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React/Vite)                                       │
│  Vercel → https://jobmatch-ai-orpin.vercel.app              │
│  Env: VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API (axios, Bearer JWT)
┌──────────────────────▼──────────────────────────────────────┐
│  Backend (FastAPI)                                           │
│  Railway → https://jobmatchai-production-5867.up.railway.app│
│  /api/v1/jobs/       /api/v1/matches/    /api/v1/resumes/   │
│  /api/v1/profile/    /api/v1/cover-letter/  /api/v1/auth/   │
└──────────┬───────────────────┬──────────────────────────────┘
           │                   │
┌──────────▼──────┐   ┌────────▼──────────────────────────────┐
│  PostgreSQL     │   │  ARQ Worker (Railway separate service) │
│  Railway DB     │   │  Tasks: scrape_source,                 │
│                 │   │         auto_analyze_matches           │
└─────────────────┘   └────────────────┬───────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Redis (Railway) │
                              │  Job Queue       │
                              └─────────────────┘
```

### Railway Services (Production)

| Service | Start Command | Root Dir |
|---|---|---|
| `jobmatch-ai` (API) | Auto-detected via Dockerfile | `backend/` |
| `jobmatch-worker` (ARQ) | `python -m arq app.worker.arq_worker.WorkerSettings` | `backend/` |
| `Redis` | Managed Railway service | — |
| `Postgres` | Managed Railway service | — |

### Multi-Environment Setup

Two Railway environments are in use:

- **Production** — serves `https://jobmatch-ai-orpin.vercel.app`
- **Development** — serves Vercel preview deployments

Both environments share the same GitHub repo. CORS is configured with `allow_origin_regex=r"https://.*\.vercel\.app"` so all Vercel URLs (production and preview) are automatically accepted without manual updates.

---

## 4. Data Models

### Tables (PostgreSQL)

**`users`** — created on first login via Supabase JWT
- `id`, `supabase_id`, `email`, `full_name`, `created_at`, `deleted_at`

**`resume_profiles`** — one or more parsed resumes per user
- `id`, `user_id`, `label`, `raw_text`, `parsed_json`, `parse_confidence`, `storage_path`, `is_active`, `created_at`
- Only one resume per user has `is_active = true` at a time — this is the default used for match scoring
- New resumes are only set active if no prior resume exists for the user

**`seeker_profiles`** — job preferences per user (one per user)
- `id`, `user_id`, `status`, `desired_roles_json`, `location_prefs_json`, `seniority_band`, `company_prefs_json`, `constraints_json`, `updated_at`

**`jobs`** — all job listings (scraped or imported)
- `id`, `title`, `company`, `location`, `description`, `source`, `source_url`, `career_page_url`, `salary_range`, `posted_at`, `scraped_at`, `is_active`, `dedup_hash`
- `source` values: `jsearch`, `indeed`, `glassdoor`, `ziprecruiter`, `wellfound`, `imported`
- Imported jobs (from URL or paste) use `source = "imported"`
- Pasted JDs with no URL have `source_url = ""`

**`scrape_sources`** — health tracking per scraping source
- `id`, `source`, `last_run_at`, `last_success`, `error_count`, `is_healthy`, `status_note`
- Seeded on startup: `jsearch`, `indeed`, `glassdoor`, `ziprecruiter`, `wellfound`

**`job_matches`** — AI match results (user × job × resume)
- `id`, `user_id`, `job_id`, `resume_id`, `match_score`, `match_explanation`, `skills_gap`, `resume_suggestions`, `raw_response`, `created_at`
- Foreign key `resume_id → resume_profiles.id` — deleting a resume cascades deletes its matches in the endpoint

**`saved_jobs`** — tracker entries (user × job)
- `id`, `user_id`, `job_id`, `saved_at`, `status`, `applied_at`, `notes`

**`applications`** — legacy simple tracker (pre-Phase 3)
- `id`, `company`, `title`, `url`, `status`, `applied_date`, `notes`, `created_at`, `updated_at`

### Tracker Statuses
`saved` → `applied` → `phone_screen` → `interview` → `offer` → `rejected`

### Database Migrations
Located in `supabase/migrations/`:

| File | Description |
|---|---|
| `001_initial_schema.sql` | Users, resume_profiles, seeker_profiles |
| `002_rls_policies.prod.sql.bak` | Row-level security (Supabase) |
| `003_jobs.sql` | Jobs table |
| `004_scrape_sources.sql` | Scrape sources health table |
| `005_add_jsearch_source.sql` | Seeds jsearch source row |
| `006_job_matches.sql` | job_matches table |
| `007_tracker_status_notes.sql` | Adds status/notes/applied_at to saved_jobs |

---

## 5. Phase 1 — Job Feed & Scraping

**Status: ✅ Complete**

- Background ARQ workers scrape configured sources every 6 hours via APScheduler
- JSearch (RapidAPI) is the primary active job source — **Note: quota is 200 req/month on Basic plan**
- Deduplication via `dedup_hash` (SHA256 of title+company+location for scraped; URL hash for imported)
- Personalized query builder reads all active users' resume + seeker profiles to generate targeted search queries (capped at 15)
- Fallback queries used when no user profiles exist
- Spam company filter applied to JSearch results
- Paginated job feed with filters: keyword search, source, remote-only, min score
- Score-sorted feed (analyzed jobs first)
- Source health tracking per scraper

### Key Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/jobs/` | Paginated job feed with filters |
| `GET` | `/api/v1/jobs/{job_id}` | Job detail with description |
| `GET` | `/api/v1/jobs/sources/health` | Scraper source health status |
| `POST` | `/api/v1/jobs/trigger-scrape` | Manually trigger scrape (requires `X-Admin-Key` header) |

---

## 6. Phase 2 — Resume & Match Analysis

**Status: ✅ Complete**

- Upload resume as PDF or DOCX → text extracted via pdfplumber / python-docx
- Paste resume text directly as alternative input
- Claude parses resume into structured JSON: name, email, skills, experience, education, certifications, strengths, career trajectory, inferred seniority, suggested roles, confidence score
- One active resume per user at a time — used for all match scoring
- Claude analyzes resume vs. job → returns `match_score` (0–100), `match_explanation`, `skills_gap`, `resume_suggestions`
- Background auto-analysis enqueues match scoring for top ~20 unanalyzed jobs on demand

### Key Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/resumes/upload` | Upload PDF/DOCX resume |
| `POST` | `/api/v1/resumes/paste` | Submit resume as plain text |
| `GET` | `/api/v1/resumes/` | List all user resumes |
| `GET` | `/api/v1/resumes/{id}` | Get single resume profile |
| `PATCH` | `/api/v1/resumes/{id}/set-active` | Set resume as default (deactivates all others) |
| `PATCH` | `/api/v1/resumes/{id}/label` | Rename a resume label |
| `DELETE` | `/api/v1/resumes/{id}` | Delete resume (blocked if only one; auto-promotes another if deleting active) |
| `POST` | `/api/v1/matches/{job_id}` | Analyze match for a specific job |
| `GET` | `/api/v1/matches/` | List all matches for current user |
| `GET` | `/api/v1/matches/{job_id}` | Get existing match for a job |
| `DELETE` | `/api/v1/matches/{job_id}` | Delete match to allow re-analysis |
| `POST` | `/api/v1/matches/refresh` | Enqueue background auto-analysis |

---

## 7. Phase 3 — Tracker, Cover Letter & Resume Management

**Status: 🔄 In Progress**

### 7a. Application Tracker Kanban ✅

Kanban board with six columns: Saved, Applied, Phone Screen, Interview, Offer, Rejected.

- Drag-free — status changed via per-card dropdown
- Cards show: title, company, location, match score badge, applied date, notes
- Click any card to open a detail drawer with full JD, match explanation, notes editor, Apply button, and status selector
- **Apply button behavior:** Active (blue) when a URL is available; disabled/grayed when no URL (e.g. pasted JDs without URL)
- Notes auto-save on blur in the drawer

### 7b. URL Import to Tracker ✅

`POST /api/v1/matches/tracker/from-url`

- Accepts `{ url, status, notes }`
- Fetches page → extracts title/company/location/description
- Upserts job record → saves to tracker → runs match analysis immediately
- Returns `TrackerCardOut` with match score populated
- Default status: `applied`

**Extraction strategy (`url_job_extractor.py`):**
1. `httpx` fast fetch → JSON-LD schema.org `JobPosting` parser
2. Fallback: OpenGraph meta tags
3. Fallback: `<title>` + body text scrape

### 7c. JD Paste Import to Tracker ✅

`POST /api/v1/matches/tracker/from-text`

- Accepts `{ title, company, description, location?, url?, notes? }`
- Creates job record directly from provided fields — no URL fetch required
- Dedup hash based on `title + company + description[:200]` to prevent duplicate submissions
- Saves to tracker with status `saved`
- Runs match analysis immediately against active resume
- If `url` is provided: stored as `source_url` and `career_page_url`, Apply button is active
- If no `url`: `source_url = ""`, Apply button is disabled in the UI

**UI Entry Point:** "Paste JD" button on Tracker page (dark slate, alongside "Add from URL")

### 7d. Cover Letter Generator ✅

- Located at `/cover-letter` route (`CoverLetterPage.tsx`)
- User selects a job from their tracker
- Claude generates a tailored cover letter combining resume content + job description
- Requires an active resume to be set

### 7e. Resume Manager ✅

Full resume management at `/resumes` route (`ResumesPage.tsx`).

- List all resume profiles with: label, parse confidence badge, added date, default indicator
- **Set Default** — marks selected resume as active, deactivates all others
- **Rename** — inline edit of resume label (press Enter or click Save)
- **Delete** — requires confirmation; blocked if only one resume exists; if deleting the active resume, the most recently added other resume is auto-promoted
- **Add Resume** — modal with upload (PDF/DOCX drag-drop) and paste tabs; new resumes are only set active if no prior resume exists
- **View** — links to full parsed resume profile page

**Nav:** "Resume" nav item now routes to `/resumes` (was `/resume/upload`)

### Key Tracker/Tracker-Adjacent Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/matches/tracker/` | Full Kanban data with job + match details |
| `POST` | `/api/v1/matches/tracker/from-url` | Add job by URL |
| `POST` | `/api/v1/matches/tracker/from-text` | Add job by pasted JD |
| `POST` | `/api/v1/matches/saved/{job_id}` | Save a job |
| `DELETE` | `/api/v1/matches/saved/{job_id}` | Remove from tracker |
| `PATCH` | `/api/v1/matches/saved/{job_id}` | Update status / notes / applied_at |
| `GET` | `/api/v1/matches/saved/` | List all saved jobs |
| `POST` | `/api/v1/cover-letter/` | Generate cover letter |

---

## 8. Phase 4 — ATS Ingestion Hardening

**Status: 📋 Planned**

The URL import works for standard job boards but fails for JS-rendered ATS platforms. This phase hardens that layer.

### Problem

Most enterprise ATS platforms (Greenhouse, Lever, Workday, iCIMS, etc.) render job content via JavaScript. The current `httpx`-only fetch returns an empty shell with no job data.

Greenhouse-specific issue: embedded jobs require a board slug that must be discovered dynamically — guessing from the domain fails when the company's internal slug differs from their domain name.

### Target Architecture

```
User URL
   ↓
ATS Detector (domain pattern matching)
   ↓
ATS-Specific API Adapter (Greenhouse, Lever, Workday...)
   ↓
If API succeeds → Structured Job Object
   ↓
If API fails → Playwright headless render
   ↓
If content still thin → Claude AI extraction
   ↓
Store in Postgres, return normalized JSON
```

### Implementation Plan

**Tier 1 — Fast path (existing, keep):**
`httpx` fetch → JSON-LD / OpenGraph / title scrape (~1s)

**Tier 2 — ATS API adapters (to build):**

| ATS | Method | Board Slug Discovery |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}` | Try domain, then search `boards.greenhouse.io` |
| Lever | `GET https://api.lever.co/v0/postings/{company}/{id}` | Extract from URL path |
| Workday | Tenant-specific API | Extract tenant from URL subdomain |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}` | Extract slug from URL |

**Tier 3 — Playwright render (existing, improve):**
Wait for `networkidle` + 2s. Triggered only for known ATS domains with thin content.

Known ATS domains to flag for Playwright:
`icims.com, greenhouse.io, lever.co, workday.com, myworkdayjobs.com, taleo.net, successfactors.com, jobvite.com, smartrecruiters.com, ashbyhq.com`

**Tier 4 — Claude AI extraction (fallback):**
```
Extract job posting information from this webpage text. Return ONLY valid JSON:
{ "title": "...", "company": "...", "location": "...", "description": "..." }
```

### Alternative: External Rendering API
Replace Playwright with ScrapingBee or Browserless.io — same capability, avoids ~300MB Chromium in Docker image, better for Railway resource limits.

### Engineering Tasks

Priority 1:
- Dynamic Greenhouse board slug discovery
- Log all API response failures explicitly (no silent fallback)

Priority 2:
- Structured job object output from all adapters
- Ingestion status/error surfaced to frontend

Priority 3:
- Lever validation testing
- Workday tenant adapter
- iCIMS adapter

---

## 9. Phase 5 — Future Features

- Email/calendar integration (track interview dates, set reminders)
- Browser extension for one-click job saving from any page
- Resume tailoring suggestions per job (rewrite bullet points to match JD)
- Dashboard analytics (application funnel, response rates, time-to-response)
- Multi-resume selection per application in tracker (track which resume was used)
- Salary insights and negotiation tracking
- Additional free job scrapers (Remotive, Arbeitnow, The Muse)

---

## 10. File Structure

```
jobmatch_ai/
├── docs/
│   ├── JobMatchAI_PRD.md           ← This file
│   └── VERCEL_DEPLOYMENT_GUIDE.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AppLayout.tsx       # Nav + layout shell
│   │   │   └── ErrorBoundary.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts
│   │   ├── lib/
│   │   │   ├── api.ts              # axios instance w/ auth interceptor
│   │   │   └── supabase.ts         # Supabase client
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── JobsPage.tsx
│   │   │   ├── TrackerPage.tsx         # Kanban + URL/paste import modals
│   │   │   ├── ResumesPage.tsx         # Resume manager (list/add/delete/set default)
│   │   │   ├── ResumeUploadPage.tsx    # Standalone upload (onboarding flow)
│   │   │   ├── ResumeProfilePage.tsx   # Parsed resume detail view
│   │   │   ├── CoverLetterPage.tsx
│   │   │   ├── OnboardingPreferencesPage.tsx
│   │   │   └── LoginPage.tsx
│   │   └── App.tsx                 # Routes
│   ├── vercel.json
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS (allow_origin_regex for Vercel)
│   │   ├── api/routes/
│   │   │   ├── auth.py
│   │   │   ├── jobs.py             # Job feed + trigger-scrape
│   │   │   ├── matches.py          # Match analysis + tracker endpoints
│   │   │   ├── resumes.py          # Resume CRUD + set-active
│   │   │   ├── cover_letter.py
│   │   │   ├── profile.py
│   │   │   └── applications.py     # Legacy applications tracker
│   │   ├── services/
│   │   │   ├── url_job_extractor.py    # URL → job data extraction
│   │   │   ├── match_service.py        # Claude match analysis
│   │   │   ├── cover_letter_service.py
│   │   │   ├── resume_parser.py        # PDF/DOCX extraction + Claude parse
│   │   │   ├── storage.py              # Supabase Storage for resume files
│   │   │   └── scraping/
│   │   │       ├── sources/
│   │   │       │   ├── base.py
│   │   │       │   ├── jsearch.py      # JSearch/RapidAPI scraper
│   │   │       │   └── [others].py     # indeed, glassdoor, etc. (scaffolded)
│   │   │       ├── normalize.py        # JobRaw dataclass + cleaning utils
│   │   │       └── dedupe.py           # Hash-based deduplication + upsert
│   │   ├── worker/
│   │   │   ├── arq_worker.py           # ARQ WorkerSettings
│   │   │   ├── tasks.py                # scrape_source, auto_analyze_matches
│   │   │   └── scheduler.py            # APScheduler (6hr scrape, 30min match)
│   │   ├── models/
│   │   │   ├── models.py               # All SQLAlchemy ORM models
│   │   │   └── application.py          # Legacy Application model
│   │   ├── schemas/
│   │   │   ├── schemas.py              # All Pydantic request/response schemas
│   │   │   └── application.py
│   │   ├── db/
│   │   │   └── database.py             # Engine (pool_pre_ping, pool_recycle), get_db
│   │   └── core/
│   │       ├── config.py               # Pydantic settings from env
│   │       └── auth.py                 # Supabase JWT validation
│   ├── Dockerfile
│   └── requirements.txt
├── supabase/
│   └── migrations/                 # 001–007 SQL migration files
├── docker-compose.yml
└── .env                            # Never commit — see env vars section
```

---

## 11. Deployment

### Local Development

```bash
cp .env.example .env   # fill in secrets
docker compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Production (Current Setup)

**Frontend → Vercel**
- Repo root: `frontend/`
- Build: `npm run build` → output: `dist/`
- `vercel.json` in `frontend/`:
  ```json
  { "buildCommand": "npm run build", "outputDirectory": "dist", "framework": "vite" }
  ```
- Production URL: `https://jobmatch-ai-orpin.vercel.app`

**Backend + Worker → Railway**

| Service | Root Dir | Start Command |
|---|---|---|
| API | `backend/` | Auto via Dockerfile |
| Worker | `backend/` | `python -m arq app.worker.arq_worker.WorkerSettings` |

- Redis and Postgres are Railway managed services
- `REDIS_URL` is auto-injected; update manually in both API and worker services if Railway rotates credentials during an incident

**CORS Configuration (`main.py`)**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173",
                   "https://jobmatch-ai-orpin.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
The regex covers all Vercel preview URLs automatically — no manual updates needed when Vercel generates new preview deployment URLs.

**Supabase Auth Config**
- Site URL: `https://jobmatch-ai-orpin.vercel.app`
- Redirect URLs: `https://jobmatch-ai-orpin.vercel.app/**`

### Development Environment

A second Railway environment exists pointing at Vercel preview deployments. Uses the same codebase; `ENVIRONMENT=development` enables SQLAlchemy query echo logging. Shares Supabase project with production (can be separated later).

---

## 12. Environment Variables

### Backend (Railway — both environments)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL URI (`postgresql://...`) |
| `REDIS_URL` | Redis DSN — auto-injected by Railway Redis; update manually after Railway incidents |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `SECRET_KEY` | Random secret (`openssl rand -hex 32`) |
| `ENVIRONMENT` | `development` or `production` — controls SQL echo logging |
| `ADMIN_API_KEY` | Key for admin endpoints (trigger-scrape) |
| `JSEARCH_API_KEY` | RapidAPI JSearch key — Basic plan = 200 req/month |

### Frontend (Vercel — per environment)

| Variable | Production | Development/Preview |
|---|---|---|
| `VITE_API_URL` | `https://jobmatchai-production-5867.up.railway.app` | Railway dev environment URL |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Same |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Same |

---

## 13. Known Issues & Decisions Log

### 🔴 Open: JSearch quota exhausted (monthly)

**Filed:** March 10, 2026
**Detail:** RapidAPI JSearch Basic plan is 200 requests/month. The personalized query builder generates up to 15 queries per scrape run × 4 runs/day = quota burns within days. Scraper returns 429 and `fetched: 0` silently.
**Options:**
- Upgrade RapidAPI plan (~$10/month for more requests)
- Reduce scrape frequency to once daily
- Add free alternative sources (Remotive API, Arbeitnow — no key required)
- Wait for monthly quota reset

---

### 🔴 Open: URL Import unreliable for JS-rendered ATS platforms

**Filed:** March 2, 2026
**Affected:** iCIMS, Greenhouse, Workday, Lever, Taleo, Ashby, SmartRecruiters
**Root Cause:** `url_job_extractor.py` uses `httpx` only. ATS platforms render via JavaScript — raw HTML contains no job data. Playwright is available in the Docker image but not yet integrated into the extraction tier.
**Designed Fix:** See Phase 4 — ATS Ingestion Hardening above.

---

### ✅ Resolved: CORS blocking all API requests after Railway incident

**Filed/Resolved:** March 10, 2026
**Root Cause:** Railway's service incident rotated Redis credentials, causing the worker to crash. Separately, the Vercel preview URL `jobmatch-ai-orpin.vercel.app` was in the static `allow_origins` list but a regex was needed to cover all preview deployments.
**Fix:** Added `allow_origin_regex=r"https://.*\.vercel\.app"` to CORS middleware. Added `pool_pre_ping=True` and `pool_recycle=300` to SQLAlchemy engine to handle stale DB connections after infrastructure incidents.

---

### ✅ Resolved: All resumes showing as default; set-default and delete failing

**Filed/Resolved:** March 10, 2026
**Root Cause 1:** Upload endpoints unconditionally set `is_active=True` — every new resume became the default.
**Root Cause 2:** FastAPI route ordering — `GET /{resume_id}` was registered before `PATCH /{resume_id}/set-active` and `DELETE /{resume_id}`, causing sub-path routes to be intercepted.
**Root Cause 3:** Delete endpoint mixed ORM-tracked objects with raw `delete()` DML in the same session without flushing, causing FK constraint violations.
**Fix:** New resumes only activate if no prior resume exists. Sub-path routes moved above bare `/{resume_id}` route. Delete uses `await db.delete(target)` (ORM-level) with explicit `await db.flush()` before commit. `job_matches` rows referencing the deleted resume are deleted first to satisfy FK constraint.

---

### ✅ Resolved: ARQ worker Redis auth failure after Railway incident

**Filed/Resolved:** March 10, 2026
**Root Cause:** Railway rotated Redis credentials during service incident. `REDIS_URL` env var in both backend and worker services became stale.
**Fix:** Copy fresh `REDIS_URL` from Railway Redis service → Variables tab into both the API service and worker service variables. Railway auto-redeploys on save.

---

### 📝 Decision: `get_db` does not auto-commit

All write endpoints explicitly call `await db.commit()` after mutations. The `get_db` session dependency only handles rollback on exception — it does not commit on exit. This prevents phantom commits on read-only requests and makes transaction boundaries explicit.

---

### 📝 Decision: `claude-sonnet-4-20250514` as default model

Used for: resume parsing, match analysis, cover letter generation, URL job extraction fallback. Max tokens: 1000 for structured extractions, higher for cover letters.

---

### 📝 Decision: Auth via Supabase JWT

Frontend stores session in Supabase client. Every API request injects `Authorization: Bearer <access_token>` via axios interceptor (`lib/api.ts`). Backend validates token by calling Supabase `/auth/v1/user` on each request (`app/core/auth.py`). User record auto-created in local `users` table on first login.

---

### 📝 Decision: Pasted JDs use empty source_url

Jobs imported via the JD Paste flow with no URL provided store `source_url = ""` and `career_page_url = null`. The frontend `JobDetailDrawer` checks `hasApplyUrl = !!applyUrl && !applyUrl.startsWith('pasted://')` and renders the Apply button as disabled when no real URL is available.