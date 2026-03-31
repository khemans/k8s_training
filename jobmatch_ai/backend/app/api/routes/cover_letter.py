"""
cover_letter.py
POST /api/v1/cover-letter/generate         — stream cover letter via SSE
POST /api/v1/cover-letter/generate-full    — return full text (for save/download)
GET  /api/v1/cover-letter/jobs             — list user's jobs for the picker
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.models import Job, JobMatch, ResumeProfile, SavedJob, User
from app.services.cover_letter_service import generate_cover_letter, generate_cover_letter_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])

VALID_TONES = {"professional", "conversational", "enthusiastic", "concise"}


class CoverLetterRequest(BaseModel):
    job_id: Optional[str] = None          # pick a job from the DB
    job_title: Optional[str] = None       # or provide manually
    company: Optional[str] = None
    job_description: Optional[str] = None
    tone: str = "professional"
    resume_id: Optional[str] = None       # optional: pick a specific resume


class CoverLetterJobOut(BaseModel):
    id: str
    title: str
    company: str
    location: Optional[str]
    source: str
    match_score: Optional[int] = None

    class Config:
        from_attributes = True


async def _resolve_request(
    body: CoverLetterRequest,
    user: User,
    db: AsyncSession,
) -> tuple[str, str, str, str]:
    """
    Resolve the request into (resume_text, job_title, company, job_description).
    """
    # Resolve resume
    if body.resume_id:
        result = await db.execute(
            select(ResumeProfile).where(
                ResumeProfile.id == body.resume_id,
                ResumeProfile.user_id == str(user.id),
            )
        )
        resume = result.scalar_one_or_none()
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found.")
    else:
        result = await db.execute(
            select(ResumeProfile)
            .where(ResumeProfile.user_id == str(user.id), ResumeProfile.is_active.is_(True))
            .order_by(ResumeProfile.created_at.desc())
            .limit(1)
        )
        resume = result.scalar_one_or_none()
        if not resume:
            raise HTTPException(status_code=404, detail="No active resume found. Please upload a resume first.")

    # Resolve job
    if body.job_id:
        result = await db.execute(select(Job).where(Job.id == body.job_id))
        job = result.scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        job_title = job.title
        company = job.company
        job_description = job.description or ""
    elif body.job_title and body.company:
        job_title = body.job_title
        company = body.company
        job_description = body.job_description or ""
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either job_id or both job_title and company.",
        )

    if body.tone not in VALID_TONES:
        raise HTTPException(status_code=400, detail=f"tone must be one of: {', '.join(VALID_TONES)}")

    return resume.raw_text, job_title, company, job_description


@router.post("/generate")
async def stream_cover_letter(
    body: CoverLetterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stream a cover letter using Server-Sent Events (SSE).
    Each chunk arrives as: data: <text>\n\n
    Final event: data: [DONE]\n\n
    """
    resume_text, job_title, company, job_description = await _resolve_request(body, current_user, db)

    async def event_stream():
        try:
            async for chunk in generate_cover_letter_stream(
                resume_text=resume_text,
                job_title=job_title,
                company=company,
                job_description=job_description,
                tone=body.tone,
            ):
                # SSE format: escape newlines in the chunk
                payload = json.dumps({"text": chunk})
                yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error("Cover letter stream error: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate-full")
async def generate_full_cover_letter(
    body: CoverLetterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and return the complete cover letter text at once."""
    resume_text, job_title, company, job_description = await _resolve_request(body, current_user, db)

    try:
        text = await generate_cover_letter(
            resume_text=resume_text,
            job_title=job_title,
            company=company,
            job_description=job_description,
            tone=body.tone,
        )
        return {"cover_letter": text, "job_title": job_title, "company": company, "tone": body.tone}
    except Exception as e:
        logger.error("Cover letter generation error: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {str(e)}")


@router.get("/jobs", response_model=list[CoverLetterJobOut])
async def list_jobs_for_picker(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return jobs the user has saved or analyzed — best candidates for cover letter generation.
    Includes match score where available. Sorted by score desc, then by saved date.
    """
    user_id = str(current_user.id)

    # Get saved jobs
    saved_result = await db.execute(
        select(SavedJob, Job)
        .join(Job, SavedJob.job_id == Job.id)
        .where(SavedJob.user_id == user_id)
        .order_by(SavedJob.saved_at.desc())
        .limit(50)
    )
    saved_rows = saved_result.all()

    # Get match scores
    job_ids = [row[1].id for row in saved_rows]
    if job_ids:
        matches_result = await db.execute(
            select(JobMatch.job_id, JobMatch.match_score)
            .where(JobMatch.user_id == user_id, JobMatch.job_id.in_(job_ids))
        )
        scores = {str(row[0]): row[1] for row in matches_result.all()}
    else:
        scores = {}

    # If no saved jobs, fall back to analyzed jobs
    if not saved_rows:
        analyzed_result = await db.execute(
            select(JobMatch, Job)
            .join(Job, JobMatch.job_id == Job.id)
            .where(JobMatch.user_id == user_id)
            .order_by(JobMatch.match_score.desc())
            .limit(50)
        )
        out = []
        for match, job in analyzed_result.all():
            out.append(CoverLetterJobOut(
                id=str(job.id),
                title=job.title,
                company=job.company,
                location=job.location,
                source=job.source,
                match_score=match.match_score,
            ))
        return out

    out = []
    for saved, job in saved_rows:
        out.append(CoverLetterJobOut(
            id=str(job.id),
            title=job.title,
            company=job.company,
            location=job.location,
            source=job.source,
            match_score=scores.get(str(job.id)),
        ))

    # Sort: scored jobs first (by score desc), then unscored
    out.sort(key=lambda j: (j.match_score is None, -(j.match_score or 0)))
    return out
