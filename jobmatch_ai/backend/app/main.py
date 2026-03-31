from fastapi import FastAPI
from app.api.routes.applications import router as applications_router
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.db.database import create_tables
from app.api.routes import auth, resumes, profile
from app.api.routes.jobs import router as jobs_router
from app.api.routes.matches import router as matches_router
from app.api.routes.cover_letter import router as cover_letter_router
from app.core.config import get_settings
from app.worker.scheduler import create_scheduler

settings = get_settings()

import app.models.application

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    scheduler = create_scheduler()
    scheduler.start()
    app.state.scheduler = scheduler
    yield
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown(wait=False)

# 1️⃣ Create the FastAPI app first
app = FastAPI(
    title="JobMatch AI API",
    version="0.3.0",
    description="Backend API for JobMatch AI — Phase 2",
    lifespan=lifespan,
)

# 2️⃣ Add CORS middleware after app is defined
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://jobmatch-ai-frontend.vercel.app",
    "https://jobmatch-ai-orpin.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3️⃣ Include your routers

app.include_router(auth.router, prefix="/api/v1")
app.include_router(resumes.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(matches_router, prefix="/api/v1")
app.include_router(cover_letter_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1/applications")

# 4️⃣ Health check
@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}

# Playwright browser
from playwright.async_api import async_playwright

async def fetch_jd(url: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        page = await browser.new_page()
        await page.goto(url, timeout=60000)
        content = await page.content()
        await browser.close()
        return content