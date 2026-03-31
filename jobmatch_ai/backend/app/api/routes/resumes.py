from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.models import User, ResumeProfile
from app.schemas.schemas import ResumeUploadResponse, ResumeProfileOut
from app.services.resume_parser import extract_text, parse_resume_with_claude
from app.services.storage import upload_resume

router = APIRouter(prefix="/resumes", tags=["resumes"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def _resume_count(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count()).select_from(ResumeProfile).where(
            ResumeProfile.user_id == user_id
        )
    )
    return result.scalar()


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume_file(
    file: UploadFile = File(...),
    label: Optional[str] = Form(default="Default"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF or Word resume file, parse it with Claude, and save the profile."""
    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 10 MB.")

    raw_text, fmt = extract_text(file_bytes, file.content_type or "")
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from file.")

    storage_path = upload_resume(file_bytes, str(current_user.id), file.filename or f"resume.{fmt}")

    import logging
    logger = logging.getLogger(__name__)
    try:
        parsed = parse_resume_with_claude(raw_text)
    except Exception as e:
        logger.error(f"Claude parsing failed: {e}")
        parsed = None

    confidence = parsed.get("confidence_score", 0.0) if parsed else 0.0
    is_first = (await _resume_count(db, str(current_user.id))) == 0

    profile = ResumeProfile(
        user_id=str(current_user.id),
        label=label or "Default",
        raw_text=raw_text,
        parsed_json=parsed,
        parse_confidence=confidence,
        storage_path=storage_path,
        is_active=is_first,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/paste", response_model=ResumeUploadResponse)
async def paste_resume_text(
    text: str = Form(...),
    label: Optional[str] = Form(default="Default"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept pasted resume text, parse it with Claude, and save the profile."""
    if not text.strip():
        raise HTTPException(status_code=422, detail="Resume text cannot be empty.")

    try:
        parsed = parse_resume_with_claude(text)
    except Exception:
        parsed = None

    confidence = parsed.get("confidence_score", 0.0) if parsed else 0.0
    is_first = (await _resume_count(db, str(current_user.id))) == 0

    profile = ResumeProfile(
        user_id=str(current_user.id),
        label=label or "Default",
        raw_text=text,
        parsed_json=parsed,
        parse_confidence=confidence,
        is_active=is_first,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/", response_model=list[ResumeProfileOut])
async def list_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all resume profiles for the current user."""
    result = await db.execute(
        select(ResumeProfile)
        .where(ResumeProfile.user_id == str(current_user.id))
        .order_by(ResumeProfile.created_at.desc())
    )
    return result.scalars().all()


# Sub-path routes MUST come before /{resume_id} to avoid being intercepted

@router.patch("/{resume_id}/set-active", response_model=ResumeProfileOut)
async def set_active_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a resume as the active/default one. Deactivates all others for this user."""
    result = await db.execute(
        select(ResumeProfile).where(
            ResumeProfile.user_id == str(current_user.id),
        )
    )
    all_resumes = result.scalars().all()

    target = None
    for r in all_resumes:
        if str(r.id) == resume_id:
            target = r
        else:
            r.is_active = False

    if not target:
        raise HTTPException(status_code=404, detail="Resume not found.")

    target.is_active = True
    await db.flush()
    await db.commit()
    await db.refresh(target)
    return target


@router.patch("/{resume_id}/label", response_model=ResumeProfileOut)
async def update_resume_label(
    resume_id: str,
    label: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a resume profile label."""
    result = await db.execute(
        select(ResumeProfile).where(
            ResumeProfile.id == resume_id,
            ResumeProfile.user_id == str(current_user.id),
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Resume not found.")
    profile.label = label.strip() or profile.label
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a resume profile. Cannot delete the only remaining resume.

    Uses pure raw SQL throughout. Loading ORM objects causes SQLAlchemy to
    intercept the job_matches DELETE and convert it to SET resume_id = NULL
    (ORM cascade nullify), violating the NOT NULL constraint.
    """
    from sqlalchemy import text

    uid = str(current_user.id)

    # 1. Count resumes (raw SQL — no ORM objects in session)
    count_result = await db.execute(
        text("SELECT COUNT(*) FROM resume_profiles WHERE user_id = :uid"),
        {"uid": uid},
    )
    if count_result.scalar() <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your only resume. Upload a new one first."
        )

    # 2. Confirm target exists and get is_active flag
    target_result = await db.execute(
        text("SELECT id, is_active FROM resume_profiles WHERE id = :rid AND user_id = :uid"),
        {"rid": resume_id, "uid": uid},
    )
    target_row = target_result.fetchone()
    if not target_row:
        raise HTTPException(status_code=404, detail="Resume not found.")

    # 3. If deleting the active resume, promote most recent other one first
    if target_row.is_active:
        await db.execute(
            text("""
                UPDATE resume_profiles
                SET is_active = TRUE
                WHERE id = (
                    SELECT id FROM resume_profiles
                    WHERE user_id = :uid AND id != :rid
                    ORDER BY created_at DESC
                    LIMIT 1
                )
            """),
            {"uid": uid, "rid": resume_id},
        )

    # 4. Delete dependent job_matches before deleting the resume (FK constraint)
    await db.execute(
        text("DELETE FROM job_matches WHERE resume_id = :rid"),
        {"rid": resume_id},
    )

    # 5. Delete the resume itself
    await db.execute(
        text("DELETE FROM resume_profiles WHERE id = :rid AND user_id = :uid"),
        {"rid": resume_id, "uid": uid},
    )

    await db.commit()


@router.get("/{resume_id}", response_model=ResumeProfileOut)
async def get_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single resume profile by ID."""
    result = await db.execute(
        select(ResumeProfile).where(
            ResumeProfile.id == resume_id,
            ResumeProfile.user_id == str(current_user.id),
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return profile
