"""
dedupe.py
Deduplication via SHA-256 hash and PostgreSQL upsert.
Cross-source duplicates are kept as separate rows to preserve source attribution.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Job
from app.services.scraping.normalize import JobRaw

logger = logging.getLogger(__name__)


def compute_hash(title: str, company: str, location: str | None) -> str:
    """Stable SHA-256 hash over normalised title + company + location."""
    key = (
        f"{title.lower().strip()}"
        f"|{company.lower().strip()}"
        f"|{(location or '').lower().strip()}"
    )
    return hashlib.sha256(key.encode()).hexdigest()


def compute_url_hash(normalized_url: str) -> str:
    """Dedup hash for URL-imported jobs (prefix so no collision with scraped hash)."""
    return "u" + hashlib.sha256(("url:" + normalized_url).encode()).hexdigest()[:63]


async def upsert_job(db: AsyncSession, job: JobRaw) -> bool:
    """
    Insert a job or update non-destructive fields on conflict.
    Returns True if a new row was inserted, False if it was a duplicate.
    """
    dedup_hash = compute_hash(job.title, job.company, job.location)

    stmt = (
        pg_insert(Job)
        .values(
            title=job.title,
            company=job.company,
            location=job.location,
            description=job.description,
            source=job.source,
            source_url=job.source_url,
            career_page_url=job.career_page_url,
            salary_range=job.salary_range_dict(),
            posted_at=job.posted_at,
            scraped_at=datetime.now(timezone.utc),
            expires_at=job.expires_at or (datetime.now(timezone.utc) + timedelta(days=30)),
            is_active=True,
            dedup_hash=dedup_hash,
        )
        .on_conflict_do_update(
            index_elements=["dedup_hash"],
            set_={
                # Refresh freshness timestamp and extend TTL
                "scraped_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
                "is_active": True,
                # Only fill in career_page_url if we didn't have one
                "career_page_url": Job.__table__.c.career_page_url,
            },
            # WHERE clause: only update career_page_url when it was previously NULL
            where=(Job.__table__.c.career_page_url.is_(None)),
        )
    )

    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount == 1


async def upsert_job_from_url(
    db: AsyncSession,
    normalized_url: str,
    title: str,
    company: str,
    location: str | None,
    description: str | None,
    source_url: str,
) -> Job:
    """
    Insert or update a job imported from URL (dedup by URL hash).
    Returns the Job instance.
    """
    url_hash = compute_url_hash(normalized_url)
    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(Job)
        .values(
            title=title,
            company=company,
            location=location,
            description=description,
            source="imported",
            source_url=source_url,
            career_page_url=source_url,
            salary_range={},
            posted_at=None,
            scraped_at=now,
            is_active=True,
            dedup_hash=url_hash,
        )
        .on_conflict_do_update(
            index_elements=["dedup_hash"],
            set_={
                "title": title,
                "company": company,
                "location": location,
                "description": description,
                "source_url": source_url,
                "career_page_url": source_url,
                "scraped_at": now,
                "is_active": True,
            },
        )
    )
    await db.execute(stmt)
    await db.flush()
    result = await db.execute(select(Job).where(Job.dedup_hash == url_hash))
    job = result.scalar_one()
    return job
