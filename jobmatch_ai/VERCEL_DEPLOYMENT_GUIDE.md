# JobMatch AI — Deployment Guide

**Last Updated:** March 10, 2026

Your app has four services to deploy:

| Service | What it is | Deploy to |
|---|---|---|
| **Frontend** | React + Vite | Vercel (static) |
| **Backend API** | FastAPI (Python 3.12) | Railway |
| **ARQ Worker** | Background job processor | Railway (second service, same repo) |
| **Redis** | Job queue | Railway managed service |
| **Postgres** | Database | Railway managed service |

---

## Step 1: Database (Railway Postgres)

1. Railway → your project → **New Service → Database → PostgreSQL**
2. Railway injects `DATABASE_URL` automatically into services in the same project
3. Run migrations manually via psql or connect via a DB client using the credentials from the Railway Variables tab

---

## Step 2: Redis (Railway)

1. Railway → your project → **New Service → Database → Redis**
2. Railway injects `REDIS_URL` automatically
3. **Important:** If Railway has an incident and restarts the Redis service, it may rotate credentials. If the worker crashes with `AuthenticationError`, copy the fresh `REDIS_URL` from the Redis service Variables tab into both your API and worker service variables manually.

---

## Step 3: Deploy the Backend API (Railway)

1. Railway → **New Service → GitHub Repo** → select your repo
2. Set **Root Directory** to `backend`
3. Railway auto-detects the `Dockerfile`
4. Set environment variables (see [Environment Variables](#environment-variables) below)
5. The service will get a URL like `https://yourapp-production.up.railway.app`

---

## Step 4: Deploy the ARQ Worker (Railway)

The worker is a second Railway service from the **same repo and same root directory** as the API, but with a different start command.

1. Railway → **New Service → GitHub Repo** → same repo
2. Set **Root Directory** to `backend`
3. Override **Start Command** to:
   ```
   python -m arq app.worker.arq_worker.WorkerSettings
   ```
4. Copy **all the same environment variables** from the API service into the worker service — the worker needs `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, and all others

---

## Step 5: Deploy the Frontend (Vercel)

### 5a. `vercel.json` (already exists at `frontend/vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

### 5b. Deploy

1. [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Select your repo
3. Set **Root Directory** to `frontend`
4. Go to **Environment Variables** and add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Railway backend URL (no trailing slash) |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

5. Set variables **per environment** in Vercel (Production vs Preview/Development) if you have multiple Railway environments

---

## Step 6: Configure Supabase Auth

In Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** Add `https://your-app.vercel.app/**`

---

## Multi-Environment Setup (Production + Development)

Railway supports multiple environments within one project. To set up a dev environment:

1. Railway → your project → **Environments** → **New Environment** (e.g. `development`)
2. Each environment gets its own set of services and variables
3. In Vercel, set `VITE_API_URL` per environment:
   - **Production** → production Railway backend URL
   - **Preview** → dev Railway backend URL
4. CORS is pre-configured to accept all `*.vercel.app` URLs via regex — no changes needed when Vercel generates new preview URLs

Set `ENVIRONMENT=development` on dev Railway services to enable SQL query logging.

---

## Environment Variables

### Backend (Railway — all services)

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Railway PostgreSQL URI | ✅ |
| `REDIS_URL` | Railway Redis URI — auto-injected but copy manually to worker | ✅ |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ✅ |
| `ANTHROPIC_API_KEY` | Anthropic API key (`sk-ant-...`) | ✅ |
| `SECRET_KEY` | Random secret — `openssl rand -hex 32` | ✅ |
| `ENVIRONMENT` | `production` or `development` | ✅ |
| `ADMIN_API_KEY` | Key for `POST /api/v1/jobs/trigger-scrape` | ✅ |
| `JSEARCH_API_KEY` | RapidAPI JSearch key (Basic = 200 req/month) | Optional |

### Frontend (Vercel)

| Variable | Value |
|---|---|
| `VITE_API_URL` | Railway backend URL (no trailing slash) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

---

## Deployment Checklist

- [ ] Railway Postgres service created
- [ ] Railway Redis service created
- [ ] Backend API service deployed from `backend/` root
- [ ] ARQ worker service deployed from `backend/` root with custom start command
- [ ] All backend env vars set on both API and worker services
- [ ] CORS updated in `app/main.py` if adding a new non-Vercel domain
- [ ] Vercel project created with `frontend/` as root directory
- [ ] All `VITE_*` env vars set in Vercel per environment
- [ ] Supabase redirect URLs updated to include Vercel domain
- [ ] Test: login, resume upload, job feed, tracker, cover letter

---

## Troubleshooting

**CORS errors in browser console**
The backend uses `allow_origin_regex=r"https://.*\.vercel\.app"` so all Vercel URLs are auto-accepted. If you're using a custom domain, add it explicitly to `allow_origins` in `main.py`.

**All endpoints returning 500 after Railway incident**
Railway incidents can leave stale database connections in the pool. The engine is configured with `pool_pre_ping=True` and `pool_recycle=300` to handle this automatically on the next request. If errors persist, trigger a redeploy via Railway dashboard.

**Worker crashes with `AuthenticationError` on Redis**
Railway rotated Redis credentials. Copy the fresh `REDIS_URL` from the Redis service Variables tab into both the API and worker service variables. Services redeploy automatically on save.

**ARQ worker not picking up jobs**
Ensure the worker service has the same `REDIS_URL` as the API service. Check Railway logs on the worker service for connection errors.

**`asyncpg` connection errors**
The `DATABASE_URL` must start with `postgresql://` or `postgres://` — the backend converts it to `postgresql+asyncpg://` automatically. If it starts with anything else the app will refuse to start with `RuntimeError: Production must use PostgreSQL database`.

**Missing Supabase environment variables on Vercel**
The `VITE_*` vars must be set before the build runs. Go to Vercel → Settings → Environment Variables → add them → **Redeploy**.

**New resume uploads all showing as default**
This was a bug fixed in March 2026. New resumes only set `is_active=True` if no prior resume exists for the user. If you have legacy data where all resumes are active, use the "Set Default" button on the Resume Manager page to normalize the state.
