"""
scheduler.py
APScheduler setup — runs inside the FastAPI process and enqueues ARQ tasks.
The actual work happens in the separate arq-worker container.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SOURCES = ["jsearch"]
SCRAPE_INTERVAL_HOURS = 6


async def enqueue_expire() -> None:
    """Enqueue the daily expire_stale_jobs cleanup task."""
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        job = await redis.enqueue_job("expire_stale_jobs")
        logger.info("Enqueued expire_stale_jobs (job_id=%s)", job.job_id if job else "?")
    except Exception as exc:
        logger.error("Failed to enqueue expire_stale_jobs: %s", exc)
    finally:
        await redis.aclose()


async def enqueue_scrape(source: str) -> None:
    """Enqueue a scrape_source task for the given source into Redis."""
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        job = await redis.enqueue_job("scrape_source", source)
        logger.info("Enqueued scrape for %s (job_id=%s)", source, job.job_id if job else "?")
    except Exception as exc:
        logger.error("Failed to enqueue scrape for %s: %s", source, exc)
    finally:
        await redis.aclose()


def create_scheduler() -> AsyncIOScheduler:
    """
    Build and return a configured APScheduler.
    Call scheduler.start() in the FastAPI lifespan.
    Each source gets an independent job that runs every 6 hours.
    The first run fires 30 seconds after startup so initial data
    appears quickly without waiting 6 hours.
    """
    scheduler = AsyncIOScheduler()
    first_run = datetime.now() + timedelta(seconds=30)

    if not settings.jsearch_api_key:
        logger.error(
            "⚠️  JSEARCH_API_KEY is missing from environment variables. "
            "JSearch scraping will be skipped. Set JSEARCH_API_KEY in Railway "
            "to populate the job feed."
        )

    for i, source in enumerate(SOURCES):
        # Stagger first runs by 15 seconds each so they don't all fire simultaneously
        staggered = first_run + timedelta(seconds=i * 15)
        scheduler.add_job(
            enqueue_scrape,
            trigger="interval",
            hours=SCRAPE_INTERVAL_HOURS,
            args=[source],
            id=f"scrape_{source}",
            next_run_time=staggered,
            misfire_grace_time=60,
            coalesce=True,
        )
        logger.info(
            "Scheduled scrape_%s every %dh, first run at %s",
            source, SCRAPE_INTERVAL_HOURS, staggered.strftime("%H:%M:%S"),
        )

    # Daily job expiry cleanup — runs at midnight UTC
    scheduler.add_job(
        enqueue_expire,
        trigger="cron",
        hour=0,
        minute=0,
        id="expire_stale_jobs",
        misfire_grace_time=3600,
        coalesce=True,
    )
    logger.info("Scheduled expire_stale_jobs daily at 00:00 UTC")

    return scheduler
