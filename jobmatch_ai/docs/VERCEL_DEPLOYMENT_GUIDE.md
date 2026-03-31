# JobMatch AI — Vercel Deployment Guide

Your app has three services to deploy:

| Service | What it is | Deploy to |
|---|---|---|
| **Frontend** | React + Vite | Vercel (static) |
| **Backend** | FastAPI (Python) | Railway / Render / Fly.io |
| **Redis** | ARQ job queue | Upstash (managed) |

Vercel is great for the frontend, but it doesn't support long-running Python processes or Redis. You'll host the backend separately and point the frontend at it.

---

## Step 1: Deploy the Backend (Railway — Recommended)

Railway is the easiest fit for your Docker-based FastAPI + ARQ worker stack.

### 1a. Push your code to GitHub
Make sure your project is in a GitHub repo. Vercel and Railway both pull from Git.

```
jobmatch_ai/
  backend/
  frontend/
  supabase/
  docker-compose.yml
```

### 1b. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select your repo → set the **Root Directory** to `backend`
3. Railway will detect the `Dockerfile` automatically

### 1c. Add a Redis service

In Railway → **New Service → Redis** — Railway provisions it and gives you a `REDIS_URL` variable automatically injected into your environment.

### 1d. Deploy the ARQ Worker as a second service

In the same Railway project → **New Service → GitHub repo** again, same repo, same root `backend`, but override the **Start Command**:

```
python -m arq app.worker.arq_worker.WorkerSettings
```

This runs alongside the main API service and shares the same env vars.

### 1e. Set environment variables in Railway

Go to your backend service → **Variables** tab and add:

```
DATABASE_URL=postgresql+asyncpg://...      # Your Supabase DB connection string
REDIS_URL=                                  # Auto-injected by Railway Redis service
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=your-secret-key-here
ENVIRONMENT=production
ADMIN_API_KEY=your-admin-key
JSEARCH_API_KEY=                            # Optional
```

> **Supabase DB URL:** In Supabase → Project Settings → Database → Connection string → URI. Use the **connection pooling** URL for production. Replace `[YOUR-PASSWORD]` with your DB password.

---

## Step 2: Deploy the Frontend to Vercel

### 2a. Create a `vercel.json` in the `frontend/` folder

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

### 2b. Add a `frontend/.env.production` (or set in Vercel dashboard)

```
VITE_API_URL=https://your-railway-backend.up.railway.app
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> **Note:** `VITE_API_URL` should be the Railway URL of your **backend service** (no trailing slash).

### 2c. Deploy via Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Select your repo
3. Set **Root Directory** to `frontend`
4. Vercel auto-detects Vite — confirm build settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Go to **Environment Variables** and add the three `VITE_*` variables above
6. Click **Deploy**

---

## Step 3: Configure CORS on Your Backend

Your FastAPI backend needs to allow requests from your Vercel domain. Find your CORS config (likely in `app/main.py`) and update the allowed origins:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-app.vercel.app",
        "http://localhost:5173",  # keep for local dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

If you haven't added CORS middleware yet, add this block right after `app = FastAPI(...)`.

---

## Step 4: Update Supabase Auth Redirect URLs

In Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** Add `https://your-app.vercel.app/**`

---

## Environment Variable Summary

### Backend (Railway)

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → URI (pooling) |
| `REDIS_URL` | Auto-injected by Railway Redis |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `SECRET_KEY` | Any random string (use `openssl rand -hex 32`) |

### Frontend (Vercel)

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Railway backend URL |
| `VITE_SUPABASE_URL` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API |

---

## Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created with backend + ARQ worker + Redis
- [ ] All backend env vars set in Railway
- [ ] CORS updated in `app/main.py` to allow Vercel domain
- [ ] Vercel project created with `frontend/` as root directory
- [ ] All `VITE_*` env vars set in Vercel
- [ ] Supabase redirect URLs updated
- [ ] Test login, resume upload, and cover letter generation end-to-end

---

## Troubleshooting

**`CORS` errors in browser console** → Double check `allow_origins` in your FastAPI app includes the exact Vercel URL (no trailing slash).

**`Missing Supabase environment variables` error** → The `VITE_*` vars weren't set before the Vercel build ran. Go to Vercel → Settings → Environment Variables → add them → **Redeploy**.

**ARQ worker not picking up jobs** → Ensure the worker service in Railway has the same `REDIS_URL` as the API service. Check Railway logs on the worker service.

**`asyncpg` connection errors** → Use the Supabase **pooling** connection string (port `6543`), not the direct one (port `5432`). Direct connections don't work well in serverless/cloud environments.