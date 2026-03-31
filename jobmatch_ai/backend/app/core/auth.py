from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.core.config import get_settings
from app.db.database import get_db
from app.models.models import User

settings = get_settings()
bearer_scheme = HTTPBearer()


async def get_supabase_user(token: str) -> dict:
    """Validate a Supabase JWT by calling the Supabase auth API."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return resp.json()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    1. Validate the Supabase JWT.
    2. Look up the local User record (create one on first login).
    """
    supabase_user = await get_supabase_user(credentials.credentials)
    supabase_id = supabase_user["id"]
    email = supabase_user.get("email", "")
    full_name = supabase_user.get("user_metadata", {}).get("full_name")

    result = await db.execute(select(User).where(User.supabase_id == supabase_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(supabase_id=supabase_id, email=email, full_name=full_name)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user
