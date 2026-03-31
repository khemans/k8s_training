"""
jobs.py
GET  /api/v1/jobs/              — paginated job listing with filters + score sorting
GET  /api/v1/jobs/{job_id}      — single job detail (includes description)
POST /api/v1/jobs/trigger-scrape — admin: enqueue all scrape jobs
GET  /api/v1/jobs/sources/health — scrape source health check
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select, func, or_, outerjoin, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.models import Job, JobMatch, ScrapeSource, User
from app.schemas.schemas import JobDetailOut, JobListResponse, JobOut, ScrapeSourceOut
from app.core.config import get_settings

from pydantic import BaseModel
from app.services.jd_ingestion import fetch_job_description

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    q: Optional[str] = Query(None, description="Search title, company, description"),
    source: Optional[list[str]] = Query(None, description="Filter by source(s)"),
    remote_only: bool = Query(False),
    min_score: Optional[int] = Query(None, ge=0, le=100, description="Only return jobs with match score >= this value"),
    analyzed_only: bool = Query(False, description="Only return jobs that have been analyzed"),
    sort_by_score: bool = Query(True, description="Show analyzed jobs first, sorted by score desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = str(current_user.id)

    # Base job filters
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    job_filters = [
        Job.is_active.is_(True),
        or_(Job.expires_at.is_(None), Job.expires_at > now),
    ]

    if q:
        term = f"%{q}%"
        job_filters.append(
            or_(
                Job.title.ilike(term),
                Job.company.ilike(term),
                Job.description.ilike(term),
            )
        )

    if source:
        job_filters.append(Job.source.in_(source))

    if remote_only:
        job_filters.append(
            or_(
                Job.location.ilike("%remote%"),
                Job.location.is_(None),
            )
        )

    if sort_by_score or min_score is not None or analyzed_only:
        # Join with job_matches for this user
        match_subq = (
            select(JobMatch.job_id, JobMatch.match_score)
            .where(JobMatch.user_id == user_id)
            .subquery()
        )

        base_q = (
            select(Job, match_subq.c.match_score)
            .outerjoin(match_subq, Job.id == match_subq.c.job_id)
            .where(*job_filters)
        )

        if min_score is not None:
            base_q = base_q.where(match_subq.c.match_score >= min_score)

        if analyzed_only:
            base_q = base_q.where(match_subq.c.match_score.isnot(None))

        # Count
        count_q = select(func.count()).select_from(base_q.subquery())
        total_result = await db.execute(count_q)
        total = total_result.scalar_one()

        # Total unanalyzed (same filters, no match for this user) for "Unanalyzed Jobs (N)" on every page
        unanalyzed_q = (
            select(Job.id)
            .outerjoin(match_subq, Job.id == match_subq.c.job_id)
            .where(*job_filters)
            .where(match_subq.c.match_score.is_(None))
        )
        unanalyzed_count_result = await db.execute(select(func.count()).select_from(unanalyzed_q.subquery()))
        total_unanalyzed = unanalyzed_count_result.scalar_one()

        # Sort: analyzed jobs (score desc) first, then unanalyzed by scraped_at desc
        if sort_by_score:
            base_q = base_q.order_by(
                match_subq.c.match_score.desc().nullslast(),
                Job.scraped_at.desc(),
            )
        else:
            base_q = base_q.order_by(Job.scraped_at.desc())

        base_q = base_q.offset((page - 1) * limit).limit(limit)
        result = await db.execute(base_q)
        rows = result.all()
        jobs = [row[0] for row in rows]

        return JobListResponse(total=total, page=page, limit=limit, results=jobs, total_unanalyzed=total_unanalyzed)

    else:
        # Simple query without score join
        count_q = select(func.count()).select_from(Job).where(*job_filters)
        total_result = await db.execute(count_q)
        total = total_result.scalar_one()

        jobs_q = (
            select(Job)
            .where(*job_filters)
            .order_by(Job.scraped_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        result = await db.execute(jobs_q)
        jobs = result.scalars().all()

    return JobListResponse(total=total, page=page, limit=limit, results=jobs)


@router.get("/sources/health", response_model=list[ScrapeSourceOut])
async def sources_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ScrapeSource).order_by(ScrapeSource.source))
    return result.scalars().all()

class JDIngestRequest(BaseModel):
    url: str
@router.post("/ingest")
async def ingest_job(payload: JDIngestRequest):
    content = await fetch_job_description(payload.url)
    return {
        "success": True,
        "content": content
    }   
@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import httpx
    from datetime import datetime, timezone

    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.is_active.is_(True))
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Layer 2 — re-verify URL on open (only for non-imported jobs with a source URL)
    is_expired = False
    if job.source != "imported" and job.source_url:
        try:
            async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
                resp = await client.head(job.source_url)
                if resp.status_code in (404, 410) or (
                    resp.status_code in (301, 302, 303, 307, 308)
                    and "job" not in resp.headers.get("location", "").lower()
                ):
                    is_expired = True
                    from sqlalchemy import text
                    await db.execute(
                        text("UPDATE jobs SET is_active = FALSE WHERE id = :id"),
                        {"id": str(job.id)},
                    )
                    await db.commit()
        except Exception:
            pass  # Network errors shouldn't block the drawer opening

    # Attach computed flag — JobDetailOut.is_expired
    job_dict = {c.name: getattr(job, c.name) for c in job.__table__.columns}
    job_dict["is_expired"] = is_expired
    return job_dict


@router.post("/trigger-scrape")
async def trigger_scrape(
    x_admin_key: str = Header(..., alias="X-Admin-Key"),
    db: AsyncSession = Depends(get_db),
):
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Key header")

    import arq
    redis = await arq.create_pool(
        arq.connections.RedisSettings.from_dsn(settings.redis_url)
    )

    # Always include known sources — don't rely solely on DB rows being seeded
    from app.worker.scheduler import SOURCES as KNOWN_SOURCES

    result = await db.execute(select(ScrapeSource))
    db_sources = {s.source for s in result.scalars().all()}

    # Union of DB sources and hardcoded known sources
    all_sources = db_sources | set(KNOWN_SOURCES)

    enqueued = []
    for source in sorted(all_sources):
        await redis.enqueue_job("scrape_source", source)
        enqueued.append(source)
        logger.info("Manually triggered scrape for source: %s", source)

    await redis.close()
    return {"enqueued": enqueued}
