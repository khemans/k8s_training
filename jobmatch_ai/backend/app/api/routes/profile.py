from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.models import User, SeekerProfile
from app.schemas.schemas import SeekerProfileUpdate, SeekerProfileOut

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/", response_model=SeekerProfileOut)
async def get_seeker_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SeekerProfile).where(SeekerProfile.user_id == str(current_user.id))
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Complete onboarding first.")
    return profile


@router.put("/", response_model=SeekerProfileOut)
async def upsert_seeker_profile(
    data: SeekerProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SeekerProfile).where(SeekerProfile.user_id == str(current_user.id))
    )
    profile = result.scalar_one_or_none()

    if not profile:
        profile = SeekerProfile(user_id=str(current_user.id))
        db.add(profile)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile
