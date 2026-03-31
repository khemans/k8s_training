from supabase import create_client, Client
from app.core.config import get_settings
import uuid

settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def upload_resume(file_bytes: bytes, user_id: str, filename: str) -> str:
    """Upload a resume file to Supabase Storage. Returns the storage path."""
    supabase = get_supabase()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    path = f"{user_id}/{uuid.uuid4()}.{ext}"

    supabase.storage.from_("resumes").upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": "application/octet-stream"},
    )
    return path


def get_resume_url(storage_path: str) -> str:
    """Get a signed download URL for a stored resume."""
    supabase = get_supabase()
    result = supabase.storage.from_("resumes").create_signed_url(
        storage_path, expires_in=3600
    )
    return result["signedURL"]
