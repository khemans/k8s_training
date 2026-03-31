from pydantic import BaseModel, EmailStr
from typing import Optional, Any
from datetime import datetime


# ── User ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    supabase_id: str
    email: EmailStr
    full_name: Optional[str] = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Resume ───────────────────────────────────────────────────────────────────

class ResumeUploadResponse(BaseModel):
    id: str
    label: str
    parse_confidence: Optional[float]
    parsed_json: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True


class ResumeProfileOut(BaseModel):
    id: str
    label: str
    raw_text: str
    parsed_json: Optional[dict]
    parse_confidence: Optional[float]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Seeker Profile ────────────────────────────────────────────────────────────

class SeekerProfileUpdate(BaseModel):
    status: Optional[str] = None
    desired_roles_json: Optional[list] = None
    location_prefs_json: Optional[dict] = None
    seniority_band: Optional[str | list] = None
    company_prefs_json: Optional[dict] = None
    constraints_json: Optional[dict] = None


class SeekerProfileOut(BaseModel):
    id: str
    status: str
    desired_roles_json: list
    location_prefs_json: dict
    seniority_band: Optional[str | list]
    company_prefs_json: dict
    constraints_json: dict
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Parsed Resume Structure ───────────────────────────────────────────────────

class ParsedResume(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    skills: dict = {}
    experience: list = []
    education: list = []
    certifications: list = []
    strengths: list = []
    career_trajectory: Optional[str] = None
    inferred_seniority: Optional[str] = None
    suggested_roles: list = []
    confidence_score: float = 0.0


# ── Jobs (Phase 1) ────────────────────────────────────────────────────────────

class JobOut(BaseModel):
    id: str
    title: str
    company: str
    location: Optional[str]
    source: str
    source_url: str
    career_page_url: Optional[str]
    salary_range: Optional[dict]
    posted_at: Optional[datetime]
    scraped_at: datetime
    expires_at: Optional[datetime] = None
    is_active: bool
    is_expired: bool = False

    class Config:
        from_attributes = True


class JobDetailOut(JobOut):
    description: Optional[str]


class JobListResponse(BaseModel):
    total: int
    page: int
    limit: int
    results: list[JobOut]
    total_unanalyzed: Optional[int] = None  # total jobs with no match for current user (all pages)


# ── Scrape Sources Health ─────────────────────────────────────────────────────

class ScrapeSourceOut(BaseModel):
    id: int
    source: str
    last_run_at: Optional[datetime]
    last_success: Optional[datetime]
    error_count: int
    is_healthy: bool
    status_note: Optional[str]

    class Config:
        from_attributes = True


# ── Job Matching (Phase 2) ────────────────────────────────────────────────────

class JobMatchOut(BaseModel):
    id: str
    job_id: str
    resume_id: str
    match_score: int
    match_explanation: Optional[str]
    skills_gap: list
    resume_suggestions: list
    created_at: datetime

    class Config:
        from_attributes = True


class JobWithMatchOut(JobDetailOut):
    """Job detail with optional match data attached."""
    match: Optional[JobMatchOut] = None


# ── Saved Jobs / Application Tracker (Phase 2 + 3) ─────────────────────────────

class SavedJobOut(BaseModel):
    id: str
    job_id: str
    saved_at: datetime
    status: str = "saved"
    applied_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class SavedJobUpdate(BaseModel):
    """Body for PATCH /matches/saved/{job_id} (tracker status/notes)."""
    status: Optional[str] = None  # saved | applied | phone_screen | interview | offer | rejected
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None
    interview_at: Optional[datetime] = None


class TrackerFromUrlRequest(BaseModel):
    """Body for POST /matches/tracker/from-url (track external job by URL)."""
    url: str
    status: Optional[str] = "applied"  # column to put the job in
    notes: Optional[str] = None


class TrackerFromTextRequest(BaseModel):
    """Body for POST /matches/tracker/from-text (track job pasted as raw JD text)."""
    title: str
    company: str
    description: str
    location: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class TrackerCardOut(BaseModel):
    """Saved job with job + match details for Kanban."""
    id: str
    job_id: str
    status: str
    saved_at: datetime
    applied_at: Optional[datetime] = None
    notes: Optional[str] = None
    title: str
    company: str
    location: Optional[str] = None
    source: str
    source_url: str
    career_page_url: Optional[str] = None
    match_score: Optional[int] = None
    match_explanation: Optional[str] = None
    interview_at: Optional[datetime] = None
