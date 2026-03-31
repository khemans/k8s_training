# JobMatch AI — Product Requirements Document
**Last Updated:** March 2, 2026  
**Version:** 1.3  
**Status:** Phase 3 In Progress

---

## Table of Contents
1. [Product Overview](#product-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Phase 1 — Job Feed & Scraping](#phase-1--job-feed--scraping) ✅ Complete
5. [Phase 2 — Resume & Match Analysis](#phase-2--resume--match-analysis) ✅ Complete
6. [Phase 3 — Tracker & Cover Letter](#phase-3--tracker--cover-letter) 🔄 In Progress
7. [Phase 4 — Future Features](#phase-4--future-features)
8. [Deployment](#deployment)
9. [Environment Variables](#environment-variables)
10. [Known Issues & Decisions Log](#known-issues--decisions-log)

---

## Product Overview

JobMatch AI is a full-stack web application that helps job seekers manage their job search using AI. Core capabilities:

- **Job Feed:** Aggregates job listings from multiple sources (scraped + JSearch/RapidAPI)
- **Resume Analysis:** Parses uploaded resumes and scores match percentage against job listings
- **Application Tracker:** Kanban-style board to track applications by status (saved → applied → interviewing → offer → rejected)
- **Cover Letter Generator:** AI-generated cover letters tailored to specific job + resume combinations
- **URL Import:** Add any job posting to the tracker by pasting a URL

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (JWT) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Job Queue | Redis + ARQ worker |
| Scheduling | APScheduler |
| Resume Parsing | pdfplumber + python-docx |
| Web Scraping | httpx + BeautifulSoup4 + lxml |
| JS Rendering | Playwright (Chromium) — added Phase 3 |
| Dev Environment | Docker Compose (db + redis + backend + arq-worker + frontend) |
| Production | Vercel (frontend) + Railway (backend + worker + Redis) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React/Vite)                                       │
│  Vercel → https://your-app.vercel.app                       │
│  Env: VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API (axios, Bearer JWT)
┌──────────────────────▼──────────────────────────────────────┐
│  Backend (FastAPI)                                           │
│  Railway → https://your-backend.up.railway.app              │
│  /api/v1/jobs/     /api/v1/matches/    /api/v1/resumes/     │
│  /api/v1/profile/  /api/v1/cover-letter/  /api/v1/auth/    │
└──────────┬───────────────────┬──────────────────────────────┘
           │                   │
┌──────────▼──────┐   ┌────────▼──────────────────────────────┐
│  Supabase       │   │  ARQ Worker (Railway separate service) │
│  PostgreSQL DB  │   │  Tasks: scrape_source,                 │
│  + Auth         │   │         auto_analyze_matches           │
└─────────────────┘   └────────────────┬───────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Redis (Railway) │
                              │  Job Queue       │
                              └─────────────────┘
```

---

## Data Models

### Core Tables (PostgreSQL via Supabase)

**jobs** — scraped/imported job listings  
**resume_profiles** — parsed resume text + metadata per user  
**job_matches** — AI match scores linking a user's resume to a job  
**saved_jobs** — tracker entries (user × job × status)  
**scrape_sources** — configured scraping source URLs  

### Tracker Statuses
`saved` → `applied` → `interviewing` → `offer` → `rejected`

---

## Phase 1 — Job Feed & Scraping
**Status: ✅ Complete**

- Scrape configured sources via ARQ background workers
- JSearch (RapidAPI) as primary job source for dev/early prod
- Deduplication on job URL
- Paginated job feed with filters: keyword search, source, remote-only, min score
- Score-sorted feed (analyzed jobs first, then unanalyzed)
- Admin endpoint `POST /api/v1/jobs/trigger-scrape` (requires `X-Admin-Key` header)
- Source health endpoint `GET /api/v1/jobs/sources/health`

---

## Phase 2 — Resume & Match Analysis
**Status: ✅ Complete**

- Upload resume as PDF or DOCX → parsed to raw text via pdfplumber / python-docx
- Active resume concept (one active at a time per user)
- Claude analyzes resume vs. job → returns: `match_score` (0–100), `match_explanation`, `skills_gap`, `resume_suggestions`
- `POST /api/v1/matches/refresh` — enqueue background auto-analysis for top ~20 unanalyzed jobs
- Saved jobs surface match scores on tracker cards

---

## Phase 3 — Tracker & Cover Letter
**Status: 🔄 In Progress**

### 3a. Application Tracker Kanban ✅
- Kanban board grouped by status column
- `GET /api/v1/matches/tracker/` — full tracker list with job + match details
- `PATCH /api/v1/matches/saved/{job_id}` — update status, notes, applied_at
- `POST /api/v1/matches/saved/{job_id}` / `DELETE` — save/unsave jobs
- Cards show: title, company, location, match score, status, notes

### 3b. URL Import to Tracker ✅ (with fix pending — see issues log)
- `POST /api/v1/matches/tracker/from-url` — accepts `{ url, status, notes }`
- Fetches URL → extracts title/company/location/description → upserts job → saves to tracker → runs match analysis
- Returns `TrackerCardOut` with match score populated immediately
- **Current extraction logic** (`url_job_extractor.py`):
  1. `httpx` fast fetch → JSON-LD schema.org `JobPosting` parser
  2. Fallback: OpenGraph meta tags
  3. Fallback: `<title>` + body text scrape

### 3c. Cover Letter Generator ✅ (just completed)
- Located at `/cover-letter` route (`CoverLetterPage.tsx`)
- Uses `VITE_API_URL` + Supabase auth token
- Backend: `cover_letter_service.py` → Claude generates tailored letter
- Requires active resume + job selection

---

## Phase 4 — Future Features
- Email/calendar integration (track interview dates)
- Browser extension for one-click job saving
- Resume tailoring suggestions per job
- Multi-resume support with resume-per-application tracking
- Dashboard analytics (application funnel, response rates)

---

## Deployment

### Local Development
```bash
cp .env.example .env   # fill in secrets
docker compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Production
- **Frontend → Vercel**
  - Root directory: `frontend/`
  - Build: `npm run build` → output: `dist/`
  - Requires `vercel.json` in `frontend/`:
    ```json
    { "buildCommand": "npm run build", "outputDirectory": "dist", "framework": "vite" }
    ```

- **Backend + ARQ Worker → Railway**
  - Backend service: root `backend/`, auto-detects Dockerfile, runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - Worker service: same repo/root, override start command: `python -m arq app.worker.arq_worker.WorkerSettings`
  - Add Railway Redis service (auto-injects `REDIS_URL`)

- **Supabase Auth config**
  - Site URL: `https://your-app.vercel.app`
  - Redirect URLs: `https://your-app.vercel.app/**`

- **CORS** — `app/main.py` must include Vercel domain in `allow_origins`

---

## Environment Variables

### Backend (.env / Railway)
| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL URI (use pooling port 6543) |
| `REDIS_URL` | Redis DSN (auto-injected by Railway Redis) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `SECRET_KEY` | Random secret for JWT signing |
| `ENVIRONMENT` | `development` or `production` |
| `ADMIN_API_KEY` | Key for admin endpoints (scrape trigger) |
| `JSEARCH_API_KEY` | RapidAPI JSearch key (optional) |
| `SCRAPE_CONCURRENCY` | Default: 4 |
| `HTTP_PROXY` | Optional proxy for scraping |
| `SCRAPER_API_KEY` | Optional ScraperAPI key |

### Frontend (Vercel / .env)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (no trailing slash) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

---

## Known Issues & Decisions Log

### 🔴 Open: URL Import fails for JS-rendered ATS platforms
**Filed:** March 2, 2026  
**Affected:** iCIMS, Greenhouse, Workday, Lever, Taleo, Ashby, and most modern ATS portals  
**Root Cause:** `url_job_extractor.py` uses `httpx` (server-side HTTP only). ATS platforms render job content via JavaScript — the raw HTML returned contains only navigation shell, no job data.  
**Example failing URL:** `https://careers-axway.icims.com/jobs/8454/senior-systems-engineer-ii/job`  
**Designed Fix (not yet implemented):**  

Add `playwright==1.44.0` to `requirements.txt`. Update `Dockerfile` to install Chromium:
```dockerfile
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium
```
Update `url_job_extractor.py` with 4-tier extraction strategy:
1. `httpx` fast fetch → JSON-LD / meta tags (keep existing, ~1s)
2. If content thin AND known ATS domain → Playwright headless render (waits for `networkidle` + 2s extra, ~4s)
3. If still thin after JS render → Claude AI extraction (reads page text, returns structured JSON)
4. Final fallback: title from `<title>` tag, company from domain

Known JS-rendered ATS domains to flag for Playwright:
`icims.com, greenhouse.io, lever.co, workday.com, myworkdayjobs.com, taleo.net, successfactors.com, jobvite.com, smartrecruiters.com, ashbyhq.com`

**Alternative (avoids Docker image bloat ~300MB):** Replace `_fetch_with_playwright()` with a call to ScrapingBee or Browserless.io API — same interface, no local browser install.

**Claude extraction prompt used:**
```
Extract job posting information from this webpage text. Return ONLY valid JSON:
{ "title": "...", "company": "...", "location": "...", "description": "..." }
```

---

### ✅ Resolved: Vercel deployment plan
**Resolved:** March 2, 2026  
Frontend → Vercel (static Vite build). Backend + ARQ worker → Railway (Docker). Redis → Railway managed. Full deployment guide written in `VERCEL_DEPLOYMENT_GUIDE.md`.

---

### 📝 Decision: `claude-sonnet-4-20250514` as default model
Used for: match analysis, cover letter generation, URL job extraction fallback. Max tokens: 1000 for extractions, higher for cover letters.

---

### 📝 Decision: Auth via Supabase JWT
Frontend stores session in Supabase client. Every API request injects `Authorization: Bearer <access_token>` via axios interceptor (`lib/api.ts`). Backend validates token via `app/core/auth.py`.

---

## File Structure Reference

```
jobmatch_ai/
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts              # axios instance w/ auth interceptor
│   │   │   └── supabase.ts         # Supabase client
│   │   └── pages/
│   │       └── CoverLetterPage.tsx # Phase 3 — just completed
│   ├── vercel.json                 # TODO: create for deployment
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app + CORS config
│   │   ├── api/routes/
│   │   │   ├── jobs.py             # Job feed endpoints
│   │   │   ├── matches.py          # Match analysis + tracker endpoints
│   │   │   ├── resumes.py          # Resume upload/management
│   │   │   ├── cover_letter.py     # Cover letter generation
│   │   │   └── profile.py          # User profile
│   │   ├── services/
│   │   │   ├── url_job_extractor.py  # URL → job data (needs Playwright fix)
│   │   │   ├── match_service.py      # Claude match analysis
│   │   │   ├── cover_letter_service.py
│   │   │   ├── resume_parser.py
│   │   │   └── scraping/            # Scrape sources + deduplication
│   │   ├── worker/
│   │   │   ├── arq_worker.py        # ARQ worker settings
│   │   │   ├── tasks.py             # scrape_source, auto_analyze_matches
│   │   │   └── scheduler.py         # APScheduler
│   │   ├── models/models.py
│   │   ├── schemas/schemas.py
│   │   └── core/
│   │       ├── config.py            # Pydantic settings
│   │       └── auth.py              # JWT validation
│   ├── Dockerfile
│   └── requirements.txt
├── supabase/migrations/             # 001–007 SQL migrations
├── docker-compose.yml
└── .env                             # Never commit — see env vars section
```