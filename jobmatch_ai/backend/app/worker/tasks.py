"""
tasks.py
ARQ background tasks.
  scrape_source(source)         — scrape one job board
  auto_analyze_matches(user_id) — analyze top 20 new jobs for a user
"""
from __future__ import annotations

import logging

from sqlalchemy import select, func, and_

from app.db.database import AsyncSessionLocal
from app.models.models import Job, JobMatch, ResumeProfile, ScrapeSource, User
from app.services.scraping import SCRAPER_MAP
from app.services.scraping.dedupe import upsert_job

logger = logging.getLogger(__name__)


async def scrape_source(ctx: dict, source: str) -> dict:
    scraper_cls = SCRAPER_MAP.get(source)
    if not scraper_cls:
        logger.error("Unknown scraper source: %s", source)
        return {"source": source, "fetched": 0, "inserted": 0, "updated": 0}

    scraper = scraper_cls()
    try:
        raw_jobs = await scraper.fetch_jobs()
    except Exception as exc:
        logger.error("Scraper %s raised: %s", source, exc, exc_info=True)
        raw_jobs = []

    fetched = len(raw_jobs)
    inserted = 0
    updated = 0

    if raw_jobs:
        async with AsyncSessionLocal() as db:
            for raw in raw_jobs:
                try:
                    was_inserted = await upsert_job(db, raw)
                    if was_inserted:
                        inserted += 1
                    else:
                        updated += 1
                except Exception as e:
                    logger.warning("upsert_job failed for '%s' @ '%s': %s", raw.title, raw.company, e)
            await db.commit()

    # Update scrape_sources health record
    async with AsyncSessionLocal() as db:
        from datetime import datetime, timezone
        result = await db.execute(select(ScrapeSource).where(ScrapeSource.source == source))
        src_record = result.scalar_one_or_none()
        if src_record:
            now = datetime.now(timezone.utc)
            src_record.last_run_at = now
            src_record.last_success = now
            src_record.error_count = 0
            src_record.is_healthy = True
            src_record.status_note = f"OK — {fetched} jobs processed"
            await db.commit()

    result_data = {"source": source, "fetched": fetched, "inserted": inserted, "updated": updated}
    logger.info("scrape_source(%s): %s", source, result_data)

    # Enqueue auto-analysis for all users with active resumes if new jobs were inserted
    if inserted > 0:
        try:
            import arq
            from app.core.config import get_settings
            settings = get_settings()
            redis = await arq.create_pool(arq.connections.RedisSettings.from_dsn(settings.redis_url))
            async with AsyncSessionLocal() as db:
                users_result = await db.execute(
                    select(User.id).join(
                        ResumeProfile,
                        and_(
                            ResumeProfile.user_id == User.id,
                            ResumeProfile.is_active.is_(True),
                        )
                    )
                )
                user_ids = [str(row[0]) for row in users_result.all()]
            for uid in user_ids:
                await redis.enqueue_job("auto_analyze_matches", uid)
                logger.info("Enqueued auto_analyze_matches for user %s", uid)
            await redis.close()
        except Exception as e:
            logger.warning("Could not enqueue auto-analysis: %s", e)

    return result_data


async def auto_analyze_matches(ctx: dict, user_id: str) -> dict:
    from app.services.match_service import analyze_match

    analyzed = 0
    skipped = 0

    async with AsyncSessionLocal() as db:
        resume_result = await db.execute(
            select(ResumeProfile)
            .where(ResumeProfile.user_id == user_id, ResumeProfile.is_active.is_(True))
            .order_by(ResumeProfile.created_at.desc())
            .limit(1)
        )
        resume = resume_result.scalar_one_or_none()

        if not resume or not resume.raw_text:
            return {"user_id": user_id, "analyzed": 0, "skipped": 0, "reason": "no_resume"}

        parsed = resume.parsed_json or {}

        # Build keyword set from resume for candidate ranking
        target_keywords: set[str] = set()
        for role in parsed.get("suggested_roles", []):
            for word in role.lower().split():
                if len(word) > 3:
                    target_keywords.add(word)
        for skill in parsed.get("skills", {}).get("technical", []):
            target_keywords.add(skill.lower())

        # Jobs already analyzed for this user+resume
        analyzed_result = await db.execute(
            select(JobMatch.job_id).where(
                JobMatch.user_id == user_id,
                JobMatch.resume_id == str(resume.id),
            )
        )
        analyzed_job_ids = {str(row[0]) for row in analyzed_result.all()}

        # Recent active jobs with descriptions
        jobs_result = await db.execute(
            select(Job)
            .where(
                Job.is_active.is_(True),
                Job.description.isnot(None),
                func.length(Job.description) > 200,
            )
            .order_by(Job.scraped_at.desc())
            .limit(100)
        )
        candidate_jobs = [j for j in jobs_result.scalars().all() if str(j.id) not in analyzed_job_ids]

    if not candidate_jobs:
        return {"user_id": user_id, "analyzed": 0, "skipped": 0, "reason": "no_new_jobs"}

    def relevance(job: Job) -> int:
        text = f"{job.title} {job.description or ''}".lower()
        return sum(1 for kw in target_keywords if kw in text)

    top_jobs = sorted(candidate_jobs, key=relevance, reverse=True)[:20]
    logger.info("auto_analyze: %d candidates → top %d for user %s", len(candidate_jobs), len(top_jobs), user_id)

    async with AsyncSessionLocal() as db:
        resume_result = await db.execute(
            select(ResumeProfile)
            .where(ResumeProfile.user_id == user_id, ResumeProfile.is_active.is_(True))
            .limit(1)
        )
        resume = resume_result.scalar_one_or_none()
        if not resume:
            return {"user_id": user_id, "analyzed": 0, "skipped": 0}

        for job in top_jobs:
            existing = await db.execute(
                select(JobMatch).where(
                    JobMatch.user_id == user_id,
                    JobMatch.job_id == str(job.id),
                    JobMatch.resume_id == str(resume.id),
                )
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            try:
                result = await analyze_match(
                    resume_text=resume.raw_text,
                    job_title=job.title,
                    company=job.company,
                    job_description=job.description or "",
                )
                db.add(JobMatch(
                    user_id=user_id,
                    job_id=str(job.id),
                    resume_id=str(resume.id),
                    match_score=result["match_score"],
                    match_explanation=result["match_explanation"],
                    skills_gap=result["skills_gap"],
                    resume_suggestions=result["resume_suggestions"],
                    raw_response=result["raw_response"],
                ))
                await db.commit()
                analyzed += 1
                logger.info("auto_analyze: '%s' @ %s → %d", job.title, job.company, result["match_score"])
            except Exception as e:
                logger.warning("auto_analyze failed for job %s: %s", job.id, e)
                skipped += 1

    return {"user_id": user_id, "analyzed": analyzed, "skipped": skipped}

async def expire_stale_jobs(ctx: dict) -> dict:
    """
    Daily cleanup: soft-delete jobs whose expires_at has passed.
    Imported/pasted jobs are never expired (expires_at IS NULL).
    Jobs in someone's tracker are deactivated but preserved — the frontend
    shows a warning banner rather than losing the card.
    """
    from datetime import datetime, timezone
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                UPDATE jobs
                SET is_active = FALSE
                WHERE is_active = TRUE
                  AND expires_at IS NOT NULL
                  AND expires_at < :now
                RETURNING id
            """),
            {"now": datetime.now(timezone.utc)},
        )
        expired_ids = [str(row[0]) for row in result.fetchall()]
        await db.commit()

    count = len(expired_ids)
    logger.info("expire_stale_jobs: deactivated %d expired jobs", count)
    return {"expired": count}
