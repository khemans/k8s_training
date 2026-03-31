"""
matches.py
POST /api/v1/matches/refresh          — enqueue auto_analyze_matches for current user (background)
POST /api/v1/matches/{job_id}        — analyze match for a job
GET  /api/v1/matches/                — list all matches for current user
GET  /api/v1/matches/{job_id}        — get existing match for a job
DELETE /api/v1/matches/{job_id}      — delete a match (re-analyze later)

POST /api/v1/matches/saved/{job_id}  — save a job
DELETE /api/v1/matches/saved/{job_id}— unsave a job
GET  /api/v1/matches/saved/          — list saved jobs
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.db.database import get_db
from app.models.models import Job, JobMatch, ResumeProfile, SavedJob, User, TRACKER_STATUSES
from app.schemas.schemas import JobMatchOut, JobWithMatchOut, SavedJobOut, SavedJobUpdate, TrackerCardOut, TrackerFromUrlRequest, TrackerFromTextRequest
from app.services.match_service import analyze_match

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/matches", tags=["matches"])


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_active_resume(user: User, db: AsyncSession) -> ResumeProfile:
    """Get user's active resume or raise 404."""
    result = await db.execute(
        select(ResumeProfile)
        .where(
            ResumeProfile.user_id == str(user.id),
            ResumeProfile.is_active.is_(True),
        )
        .order_by(ResumeProfile.created_at.desc())
        .limit(1)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(
            status_code=404,
            detail="No active resume found. Please upload a resume first.",
        )
    return resume


# ── Match analysis ────────────────────────────────────────────────────────────

@router.post("/refresh")
async def refresh_my_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Enqueue background job to analyze top ~20 unanalyzed jobs for the current user.
    Use this when you have jobs in the feed but no 'Matched Jobs' yet (e.g. after first login or new resume).
    """
    resume = await _get_active_resume(current_user, db)
    user_id = str(current_user.id)
    try:
        import arq
        settings = get_settings()
        redis = await arq.create_pool(
            arq.connections.RedisSettings.from_dsn(settings.redis_url)
        )
        await redis.enqueue_job("auto_analyze_matches", user_id)
        await redis.close()
        logger.info("Enqueued auto_analyze_matches for user %s (refresh)", user_id)
        return {"enqueued": True, "message": "Match analysis queued. New matches will appear as the worker processes jobs."}
    except Exception as e:
        logger.warning("Could not enqueue auto_analyze_matches: %s", e)
        raise HTTPException(status_code=503, detail="Could not queue match analysis. Is the worker running?")


@router.post("/{job_id}", response_model=JobMatchOut, status_code=201)
async def create_match(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze how well the user's active resume matches a job.
    If a match already exists for this user+job+resume combo, returns it without re-analyzing.
    """
    # Get the job
    job_result = await db.execute(
        select(Job).where(Job.id == job_id, Job.is_active.is_(True))
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    resume = await _get_active_resume(current_user, db)

    # Check if match already exists
    existing = await db.execute(
        select(JobMatch).where(
            JobMatch.user_id == str(current_user.id),
            JobMatch.job_id == job_id,
            JobMatch.resume_id == str(resume.id),
        )
    )
    existing_match = existing.scalar_one_or_none()
    if existing_match:
        return existing_match

    # Run Claude analysis
    try:
        result = await analyze_match(
            resume_text=resume.raw_text,
            job_title=job.title,
            company=job.company,
            job_description=job.description or "",
        )
    except Exception as e:
        logger.error("Match analysis error for job %s: %s", job_id, e)
        raise HTTPException(status_code=502, detail=f"Match analysis failed: {str(e)}")

    # Save result
    match = JobMatch(
        user_id=str(current_user.id),
        job_id=job_id,
        resume_id=str(resume.id),
        match_score=result["match_score"],
        match_explanation=result["match_explanation"],
        skills_gap=result["skills_gap"],
        resume_suggestions=result["resume_suggestions"],
        raw_response=result["raw_response"],
    )
    db.add(match)
    await db.commit()
    await db.refresh(match)
    return match


@router.get("/", response_model=list[JobMatchOut])
async def list_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all match analyses for the current user, newest first."""
    result = await db.execute(
        select(JobMatch)
        .where(JobMatch.user_id == str(current_user.id))
        .order_by(JobMatch.match_score.desc())
    )
    return result.scalars().all()


@router.get("/{job_id}", response_model=Optional[JobMatchOut])
async def get_match(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the existing match analysis for a specific job, if any."""
    resume = await _get_active_resume(current_user, db)
    result = await db.execute(
        select(JobMatch).where(
            JobMatch.user_id == str(current_user.id),
            JobMatch.job_id == job_id,
            JobMatch.resume_id == str(resume.id),
        )
    )
    return result.scalar_one_or_none()


@router.delete("/{job_id}", status_code=204)
async def delete_match(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a match so it can be re-analyzed."""
    await db.execute(
        delete(JobMatch).where(
            JobMatch.user_id == str(current_user.id),
            JobMatch.job_id == job_id,
        )
    )
    await db.commit()


# ── Saved jobs ────────────────────────────────────────────────────────────────

@router.post("/saved/{job_id}", response_model=SavedJobOut, status_code=201)
async def save_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a job for later."""
    # Verify job exists
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    if not job_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found.")

    # Check if already saved
    existing = await db.execute(
        select(SavedJob).where(
            SavedJob.user_id == str(current_user.id),
            SavedJob.job_id == job_id,
        )
    )
    saved = existing.scalar_one_or_none()
    if saved:
        return saved

    saved = SavedJob(user_id=str(current_user.id), job_id=job_id)
    db.add(saved)
    await db.commit()
    await db.refresh(saved)
    return saved


@router.patch("/saved/{job_id}", response_model=SavedJobOut)
async def update_saved_job(
    job_id: str,
    body: SavedJobUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update tracker status, notes, or applied_at for a saved job."""
    result = await db.execute(
        select(SavedJob).where(
            SavedJob.user_id == str(current_user.id),
            SavedJob.job_id == job_id,
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved job not found.")
    if body.status is not None:
        if body.status not in TRACKER_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {TRACKER_STATUSES}")
        saved.status = body.status
        if body.status == "applied" and saved.applied_at is None:
            from datetime import datetime, timezone
            saved.applied_at = body.applied_at or datetime.now(timezone.utc)
    if body.notes is not None:
        saved.notes = body.notes
    if body.applied_at is not None:
        saved.applied_at = body.applied_at
    await db.commit()
    await db.refresh(saved)
    return saved


@router.delete("/saved/{job_id}", status_code=204)
async def unsave_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a saved job."""
    await db.execute(
        delete(SavedJob).where(
            SavedJob.user_id == str(current_user.id),
            SavedJob.job_id == job_id,
        )
    )
    await db.commit()


@router.get("/saved/", response_model=list[SavedJobOut])
async def list_saved_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all saved jobs for the current user."""
    result = await db.execute(
        select(SavedJob)
        .where(SavedJob.user_id == str(current_user.id))
        .order_by(SavedJob.saved_at.desc())
    )
    return result.scalars().all()


# ── Application tracker (Kanban) ──────────────────────────────────────────────

@router.post("/tracker/from-url", response_model=TrackerCardOut, status_code=201)
async def tracker_add_from_url(
    body: TrackerFromUrlRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a job to the tracker by URL. Fetches the page, extracts title/company/description,
    creates or updates the job, saves it for the user, and runs match analysis.
    """
    from app.services.url_job_extractor import fetch_and_extract, _normalize_url
    from app.services.scraping.dedupe import upsert_job_from_url

    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="A valid job URL is required.")
    if not url.startswith(("http://", "https://")):
        if "." in url:
            url = "https://" + url
        else:
            raise HTTPException(status_code=400, detail="A valid job URL is required.")
    try:
        extracted = await fetch_and_extract(url)
    except httpx.HTTPError as e:
        logger.warning("URL fetch failed for %s: %s", url[:80], e)
        raise HTTPException(status_code=422, detail="Could not fetch URL. Check the link and try again.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    normalized = _normalize_url(extracted.source_url)
    job = await upsert_job_from_url(
        db,
        normalized,
        title=extracted.title,
        company=extracted.company,
        location=extracted.location,
        description=extracted.description,
        source_url=extracted.source_url,
    )
    await db.commit()
    await db.refresh(job)

    status = (body.status or "applied").lower()
    if status not in TRACKER_STATUSES:
        status = "applied"
    notes = (body.notes or "").strip() or None

    existing = await db.execute(
        select(SavedJob).where(
            SavedJob.user_id == str(current_user.id),
            SavedJob.job_id == job.id,
        )
    )
    saved = existing.scalar_one_or_none()
    if saved:
        saved.status = status
        saved.notes = notes
        if status == "applied" and not saved.applied_at:
            from datetime import datetime, timezone
            saved.applied_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(saved)
    else:
        from datetime import datetime, timezone
        saved = SavedJob(
            user_id=str(current_user.id),
            job_id=job.id,
            status=status,
            notes=notes,
            applied_at=datetime.now(timezone.utc) if status == "applied" else None,
        )
        db.add(saved)
        await db.commit()
        await db.refresh(saved)

    # Run match analysis so the card shows a score
    resume = await db.execute(
        select(ResumeProfile)
        .where(ResumeProfile.user_id == str(current_user.id), ResumeProfile.is_active.is_(True))
        .order_by(ResumeProfile.created_at.desc())
        .limit(1)
    )
    resume_profile = resume.scalar_one_or_none()
    match_score = None
    match_explanation = None
    if resume_profile and resume_profile.raw_text and job.description:
        try:
            result = await analyze_match(
                resume_text=resume_profile.raw_text,
                job_title=job.title,
                company=job.company,
                job_description=job.description or "",
            )
            match = JobMatch(
                user_id=str(current_user.id),
                job_id=job.id,
                resume_id=str(resume_profile.id),
                match_score=result["match_score"],
                match_explanation=result["match_explanation"],
                skills_gap=result["skills_gap"],
                resume_suggestions=result["resume_suggestions"],
                raw_response=result["raw_response"],
            )
            db.add(match)
            await db.commit()
            match_score = result["match_score"]
            match_explanation = result["match_explanation"]
        except Exception as e:
            logger.warning("Match analysis failed for imported job %s: %s", job.id, e)

    return TrackerCardOut(
        id=saved.id,
        job_id=saved.job_id,
        status=saved.status or "saved",
        saved_at=saved.saved_at,
        applied_at=saved.applied_at,
        notes=saved.notes,
        title=job.title,
        company=job.company,
        location=job.location,
        source=job.source,
        source_url=job.source_url,
        career_page_url=job.career_page_url,
        match_score=match_score,
        match_explanation=match_explanation,
        interview_at=saved.interview_at,
    )


@router.post("/tracker/from-text", response_model=TrackerCardOut, status_code=201)
async def tracker_add_from_text(
    body: TrackerFromTextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a job to the tracker by pasting raw JD text.
    Creates a job record directly from the provided fields,
    saves it to the tracker as 'saved', and runs match analysis.
    """
    from app.services.scraping.dedupe import compute_hash
    from app.models.models import Job
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from datetime import datetime, timezone
    import hashlib

    title = body.title.strip()
    company = body.company.strip()
    description = body.description.strip()
    location = (body.location or "").strip() or None
    url = (body.url or "").strip() or None
    notes = (body.notes or "").strip() or None

    if not title or not company or not description:
        raise HTTPException(status_code=400, detail="title, company, and description are required.")

    # Dedup hash based on title + company + description snippet so the same
    # pasted JD won't create duplicate rows if submitted twice
    dedup_input = f"{title.lower()}::{company.lower()}::{description[:200].lower()}"
    dedup_hash = "text::" + hashlib.sha256(dedup_input.encode()).hexdigest()[:56]

    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(Job)
        .values(
            title=title,
            company=company,
            location=location,
            description=description,
            source="imported",
            source_url=url or "",
            career_page_url=url or None,
            salary_range={},
            posted_at=None,
            scraped_at=now,
            is_active=True,
            dedup_hash=dedup_hash,
        )
        .on_conflict_do_update(
            index_elements=["dedup_hash"],
            set_={"scraped_at": now, "is_active": True},
        )
        .returning(Job)
    )
    result = await db.execute(stmt)
    job = result.scalar_one()
    await db.commit()
    await db.refresh(job)

    # Save to tracker as 'saved'
    existing = await db.execute(
        select(SavedJob).where(
            SavedJob.user_id == str(current_user.id),
            SavedJob.job_id == job.id,
        )
    )
    saved = existing.scalar_one_or_none()
    if saved:
        saved.notes = notes
        await db.commit()
        await db.refresh(saved)
    else:
        saved = SavedJob(
            user_id=str(current_user.id),
            job_id=job.id,
            status="saved",
            notes=notes,
            applied_at=None,
        )
        db.add(saved)
        await db.commit()
        await db.refresh(saved)

    # Run match analysis immediately
    resume_result = await db.execute(
        select(ResumeProfile)
        .where(ResumeProfile.user_id == str(current_user.id), ResumeProfile.is_active.is_(True))
        .order_by(ResumeProfile.created_at.desc())
        .limit(1)
    )
    resume_profile = resume_result.scalar_one_or_none()
    match_score = None
    match_explanation = None
    if resume_profile and resume_profile.raw_text:
        try:
            result = await analyze_match(
                resume_text=resume_profile.raw_text,
                job_title=job.title,
                company=job.company,
                job_description=job.description or "",
            )
            match = JobMatch(
                user_id=str(current_user.id),
                job_id=job.id,
                resume_id=str(resume_profile.id),
                match_score=result["match_score"],
                match_explanation=result["match_explanation"],
                skills_gap=result["skills_gap"],
                resume_suggestions=result["resume_suggestions"],
                raw_response=result["raw_response"],
            )
            db.add(match)
            await db.commit()
            match_score = result["match_score"]
            match_explanation = result["match_explanation"]
        except Exception as e:
            logger.warning("Match analysis failed for pasted job %s: %s", job.id, e)

    return TrackerCardOut(
        id=saved.id,
        job_id=saved.job_id,
        status=saved.status or "saved",
        saved_at=saved.saved_at,
        applied_at=saved.applied_at,
        notes=saved.notes,
        title=job.title,
        company=job.company,
        location=job.location,
        source=job.source,
        source_url=job.source_url,
        career_page_url=job.career_page_url,
        match_score=match_score,
        match_explanation=match_explanation,
        interview_at=saved.interview_at,
    )


@router.get("/tracker/", response_model=list[TrackerCardOut])
async def list_tracker(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all saved jobs with job + match details for the tracker Kanban."""
    user_id = str(current_user.id)
    result = await db.execute(
        select(SavedJob, Job)
        .join(Job, SavedJob.job_id == Job.id)
        .where(SavedJob.user_id == user_id)
        .order_by(SavedJob.saved_at.desc())
    )
    rows = result.all()
    job_ids = [r[1].id for r in rows]
    matches_result = await db.execute(
        select(JobMatch).where(
            JobMatch.user_id == user_id,
            JobMatch.job_id.in_(job_ids),
        )
    )
    matches_by_job = {m.job_id: m for m in matches_result.scalars().all()}
    out = []
    for saved, job in rows:
        m = matches_by_job.get(job.id)
        out.append(TrackerCardOut(
            id=saved.id,
            job_id=saved.job_id,
            status=saved.status or "saved",
            saved_at=saved.saved_at,
            applied_at=saved.applied_at,
            notes=saved.notes,
            title=job.title,
            company=job.company,
            location=job.location,
            source=job.source,
            source_url=job.source_url,
            career_page_url=job.career_page_url,
            match_score=m.match_score if m else None,
            match_explanation=m.match_explanation if m else None,
            interview_at=saved.interview_at,
        ))
    return out
