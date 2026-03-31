"""
arq_worker.py
ARQ worker configuration.
Run with: python -m arq app.worker.arq_worker.WorkerSettings
"""
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.worker.tasks import auto_analyze_matches, scrape_source, expire_stale_jobs

settings = get_settings()


class WorkerSettings:
    functions = [scrape_source, auto_analyze_matches, expire_stale_jobs]
    # Use the same Redis DSN as the rest of the app (e.g. redis://redis:6379 in Docker)
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 4
    job_timeout = 600       # 10 min — enough for 20 Claude calls
    keep_result = 300
    retry_jobs = True
    max_tries = 2
