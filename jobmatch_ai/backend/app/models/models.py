from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON, Float, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.db.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    supabase_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    resume_profiles = relationship("ResumeProfile", back_populates="user")
    seeker_profile = relationship("SeekerProfile", back_populates="user", uselist=False)
    job_matches = relationship("JobMatch", back_populates="user")
    saved_jobs = relationship("SavedJob", back_populates="user")


class ResumeProfile(Base):
    __tablename__ = "resume_profiles"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    label = Column(String, default="Default")
    raw_text = Column(Text, nullable=False)
    parsed_json = Column(JSON, nullable=True)
    parse_confidence = Column(Float, nullable=True)
    storage_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="resume_profiles")
    job_matches = relationship("JobMatch", back_populates="resume")


class SeekerProfile(Base):
    __tablename__ = "seeker_profiles"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), unique=True, nullable=False)
    status = Column(String, default="active")
    desired_roles_json = Column(JSON, default=list)
    location_prefs_json = Column(JSON, default=dict)
    seniority_band = Column(JSON, nullable=True)
    company_prefs_json = Column(JSON, default=dict)
    constraints_json = Column(JSON, default=dict)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    user = relationship("User", back_populates="seeker_profile")


# ── Phase 1: Job Scraping ─────────────────────────────────────────────────────

class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    title = Column(Text, nullable=False)
    company = Column(Text, nullable=False)
    location = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String(64), nullable=False, index=True)
    source_url = Column(Text, nullable=False)
    career_page_url = Column(Text, nullable=True)
    salary_range = Column(JSON, default=dict)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    scraped_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    dedup_hash = Column(String(64), unique=True, nullable=False, index=True)

    matches = relationship("JobMatch", back_populates="job")
    saves = relationship("SavedJob", back_populates="job")


class ScrapeSource(Base):
    __tablename__ = "scrape_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(64), unique=True, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_success = Column(DateTime(timezone=True), nullable=True)
    error_count = Column(Integer, default=0)
    is_healthy = Column(Boolean, default=True)
    status_note = Column(Text, nullable=True)


# ── Phase 2: Job Matching ─────────────────────────────────────────────────────

class JobMatch(Base):
    __tablename__ = "job_matches"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    job_id = Column(UUID(as_uuid=False), ForeignKey("jobs.id"), nullable=False)
    resume_id = Column(UUID(as_uuid=False), ForeignKey("resume_profiles.id"), nullable=False)
    match_score = Column(Integer, nullable=False)
    match_explanation = Column(Text, nullable=True)
    skills_gap = Column(JSON, default=list)
    resume_suggestions = Column(JSON, default=list)
    raw_response = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="job_matches")
    job = relationship("Job", back_populates="matches")
    resume = relationship("ResumeProfile", back_populates="job_matches")


TRACKER_STATUSES = ("saved", "applied", "phone_screen", "interview", "offer", "rejected")


class SavedJob(Base):
    __tablename__ = "saved_jobs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    job_id = Column(UUID(as_uuid=False), ForeignKey("jobs.id"), nullable=False)
    saved_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(32), nullable=False, default="saved")
    applied_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    interview_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="saved_jobs")
    job = relationship("Job", back_populates="saves")
