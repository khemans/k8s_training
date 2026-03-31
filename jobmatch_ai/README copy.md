# JobMatch AI — Phase 1 Files

## What's here

```
phase1/
├── docker-compose.yml                          # replace root docker-compose.yml
├── .env.example                                # adds Phase 1 vars — merge into your .env
├── supabase/migrations/
│   ├── 003_jobs.sql                            # new: jobs table
│   └── 004_scrape_sources.sql                  # new: source health table
└── backend/
    ├── requirements.txt                        # replace existing
    ├── app/
    │   ├── main.py                             # replace existing (adds scheduler + jobs router)
    │   ├── core/config.py                      # replace existing (adds scraping settings)
    │   ├── models/models.py                    # replace existing (adds Job, ScrapeSource)
    │   ├── schemas/schemas.py                  # replace existing (adds JobOut, ScrapeSourceOut)
    │   ├── api/routes/jobs.py                  # NEW file
    │   ├── worker/
    │   │   ├── __init__.py                     # NEW file
    │   │   ├── arq_worker.py                   # NEW file
    │   │   ├── scheduler.py                    # NEW file
    │   │   └── tasks.py                        # NEW file
    │   └── services/scraping/
    │       ├── __init__.py                     # NEW file
    │       ├── normalize.py                    # NEW file
    │       ├── dedupe.py                       # NEW file
    │       ├── career_url.py                   # NEW file
    │       └── sources/
    │           ├── __init__.py                 # NEW file
    │           ├── base.py                     # NEW file
    │           ├── indeed.py                   # NEW file
    │           ├── glassdoor.py                # NEW file
    │           ├── ziprecruiter.py             # NEW file
    │           └── wellfound.py               # NEW file
```

---

## Step-by-step setup

### 1. Stop your running stack
```bash
docker compose down
```

### 2. Copy files into your repo

**Replace these files** (your Phase 0 originals are superseded):
```
docker-compose.yml              ← phase1/docker-compose.yml
backend/requirements.txt        ← phase1/backend/requirements.txt
backend/app/main.py             ← phase1/backend/app/main.py
backend/app/core/config.py      ← phase1/backend/app/core/config.py
backend/app/models/models.py    ← phase1/backend/app/models/models.py
backend/app/schemas/schemas.py  ← phase1/backend/app/schemas/schemas.py
```

**Create these new directories and files:**
```
backend/app/api/routes/jobs.py
backend/app/worker/__init__.py
backend/app/worker/arq_worker.py
backend/app/worker/scheduler.py
backend/app/worker/tasks.py
backend/app/services/scraping/__init__.py
backend/app/services/scraping/normalize.py
backend/app/services/scraping/dedupe.py
backend/app/services/scraping/career_url.py
backend/app/services/scraping/sources/__init__.py
backend/app/services/scraping/sources/base.py
backend/app/services/scraping/sources/indeed.py
backend/app/services/scraping/sources/glassdoor.py
backend/app/services/scraping/sources/ziprecruiter.py
backend/app/services/scraping/sources/wellfound.py
supabase/migrations/003_jobs.sql
supabase/migrations/004_scrape_sources.sql
```

### 3. Add Phase 1 env vars to your .env

Open `.env` and add at the bottom (from `.env.example`):
```
SCRAPE_CONCURRENCY=4
SCRAPE_REQUEST_TIMEOUT=20
HTTP_PROXY=
ADMIN_API_KEY=pick-a-random-string-here
```

### 4. Rebuild and start

```bash
# Force rebuild so new packages install
docker compose up --build
```

You should see 5 healthy services: `db`, `redis`, `backend`, `arq-worker`, `frontend`.

### 5. Run the migrations

The SQL migrations run automatically on first `docker compose up` because they're
mounted into `/docker-entrypoint-initdb.d/` — but only on a **fresh** volume.

If your `postgres_data` volume already exists (Phase 0 data), run the migrations manually:

```bash
docker compose exec db psql -U jobmatch -d jobmatch -f /docker-entrypoint-initdb.d/003_jobs.sql
docker compose exec db psql -U jobmatch -d jobmatch -f /docker-entrypoint-initdb.d/004_scrape_sources.sql
```

### 6. Trigger a scrape manually

```bash
curl -X POST http://localhost:8000/api/v1/jobs/trigger-scrape \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY"
# → {"enqueued":["indeed","glassdoor","ziprecruiter","wellfound"],"message":"Scrape tasks enqueued successfully."}
```

Watch the worker logs:
```bash
docker compose logs -f arq-worker
```

### 7. Verify jobs are flowing

```bash
# You'll need a valid Supabase JWT — grab one from your browser's localStorage
# after logging in, or from the frontend's auth state.
curl http://localhost:8000/api/v1/jobs \
  -H "Authorization: Bearer YOUR_JWT"
```

Check source health:
```bash
curl http://localhost:8000/api/v1/jobs/sources/health \
  -H "Authorization: Bearer YOUR_JWT"
```

---

## Scraper notes

| Source | Method | What to watch for |
|---|---|---|
| **ZipRecruiter** | Undocumented JSON API | Most reliable. Start here if testing one source. |
| **Indeed** | HTML + JSON-LD | May need User-Agent rotation if blocked. |
| **Glassdoor** | HTML + `__NEXT_DATA__` JSON blob | Cookie consent header included; JS rendering may block full descriptions. |
| **Wellfound** | Public GraphQL | Startup-focused; good for remote roles. Session cookie may be needed for higher page counts. |

**If a scraper returns 0 jobs:** Check `arq-worker` logs for HTTP status codes.
A 403/429 means the source is blocking the IP. Set `HTTP_PROXY` in `.env` to a
residential proxy to work around this.

---

## Scheduler behaviour

- Scrapers run every **6 hours** per source (staggered by 15 seconds each).
- First run fires **30 seconds after `backend` starts** — so you'll see jobs in the DB within ~2 minutes of `docker compose up`.
- To force an immediate re-run without waiting: `POST /api/v1/jobs/trigger-scrape`.
- Source health is tracked in the `scrape_sources` table. After 3 consecutive failures, `is_healthy` goes `FALSE`. It resets automatically on the next successful run.

---

## New API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/jobs` | JWT | Paginated job list. Supports `q`, `source`, `location`, `remote_only`, `posted_after`, `page`, `limit`. |
| `GET` | `/api/v1/jobs/{id}` | JWT | Single job with full description. |
| `GET` | `/api/v1/jobs/sources/health` | JWT | Scraper health for all 4 sources. |
| `POST` | `/api/v1/jobs/trigger-scrape` | X-Admin-Key | Immediately enqueue all scrapers. |
