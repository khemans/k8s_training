"""
jsearch.py
Personalized JSearch scraper.
Builds queries from all users' resume data + seeker preferences
instead of using hardcoded generic queries.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.models.models import ResumeProfile, SeekerProfile, User
from app.services.scraping.normalize import (
    JobRaw, clean_company, clean_text, clean_title, parse_salary,
)
from app.services.scraping.sources.base import BaseScraper

logger = logging.getLogger(__name__)
settings = get_settings()

BASE_URL = "https://jsearch.p.rapidapi.com/search"

# Fallback queries used only when no users have profiles yet
FALLBACK_QUERIES = [
    "software engineer remote",
    "product manager remote",
    "data scientist remote",
]

# Companies / patterns to filter out as spam/generic
SPAM_COMPANIES = {
    "various employers", "confidential", "staffing agency", "undisclosed",
    "multiple employers", "various companies", "not specified", "employer",
    "client", "clients", "our client", "a client", "top company",
}


def _is_spam_company(company: str | None) -> bool:
    if not company:
        return True
    return company.strip().lower() in SPAM_COMPANIES


async def _build_personalized_queries() -> list[str]:
    """
    Read all active users' resume + seeker profiles and generate
    specific search queries like "senior product manager fintech remote".
    Returns deduplicated list capped at 15 queries.
    """
    queries: list[str] = []

    async with AsyncSessionLocal() as db:
        # Get all users with active resumes
        result = await db.execute(
            select(ResumeProfile, SeekerProfile)
            .outerjoin(SeekerProfile, ResumeProfile.user_id == SeekerProfile.user_id)
            .where(ResumeProfile.is_active.is_(True))
        )
        rows = result.all()

    for resume, seeker in rows:
        parsed = resume.parsed_json or {}

        # Collect role signals
        roles: list[str] = []

        # 1. Seeker's desired roles (highest priority)
        if seeker and seeker.desired_roles_json:
            roles.extend(seeker.desired_roles_json[:3])

        # 2. Resume's suggested roles
        suggested = parsed.get("suggested_roles", [])
        roles.extend(suggested[:2])

        # Deduplicate roles
        seen = set()
        unique_roles: list[str] = []
        for r in roles:
            key = r.lower().strip()
            if key not in seen:
                seen.add(key)
                unique_roles.append(r)
        roles = unique_roles[:4]

        # Seniority modifier
        seniority = ""
        if seeker and seeker.seniority_band:
            band = seeker.seniority_band
            if isinstance(band, list):
                band = band[0] if band else ""
            band = str(band).lower()
            if band in ("senior", "lead", "staff", "principal"):
                seniority = "senior"
            elif band in ("mid", "mid-level"):
                seniority = ""
            elif band in ("junior", "entry"):
                seniority = "junior"

        # Top skills for context (pick 1-2 most distinctive)
        skills = parsed.get("skills", {})
        tech_skills = skills.get("technical", [])
        # Pick skills that narrow the search meaningfully
        skill_suffix = ""
        if tech_skills:
            # Use first distinctive skill as domain hint
            skill_suffix = tech_skills[0] if len(tech_skills[0]) > 3 else (tech_skills[1] if len(tech_skills) > 1 else "")

        # Build queries
        for role in roles:
            parts = []
            if seniority:
                parts.append(seniority)
            parts.append(role)
            if skill_suffix:
                parts.append(skill_suffix)
            parts.append("remote")
            queries.append(" ".join(parts))

            # Also add a query without the skill suffix for broader coverage
            if skill_suffix:
                base_parts = []
                if seniority:
                    base_parts.append(seniority)
                base_parts.append(role)
                base_parts.append("remote")
                queries.append(" ".join(base_parts))

    # Deduplicate while preserving order
    seen_q: set[str] = set()
    unique_queries: list[str] = []
    for q in queries:
        key = q.lower()
        if key not in seen_q:
            seen_q.add(key)
            unique_queries.append(q)

    if not unique_queries:
        logger.info("No user profiles found, using fallback queries")
        return FALLBACK_QUERIES

    # Cap at 15 to stay within free tier limits (200 req/month)
    result_queries = unique_queries[:15]
    logger.info("Built %d personalized queries: %s", len(result_queries), result_queries)
    return result_queries


class JSearchScraper(BaseScraper):
    source = "jsearch"

    async def fetch_jobs(self) -> list[JobRaw]:
        if not settings.jsearch_api_key:
            logger.error(
                "JSEARCH_API_KEY is not set — JSearch scraping is disabled. "
                "Set this env var in Railway to enable job feed population."
            )
            return []

        queries = await _build_personalized_queries()
        jobs: list[JobRaw] = []

        headers = {
            "X-RapidAPI-Key": settings.jsearch_api_key,
            "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        }

        async with httpx.AsyncClient(
            headers=headers,
            timeout=30.0,
            follow_redirects=True,
        ) as client:
            for query in queries:
                try:
                    batch = await self._fetch_query(client, query)
                    jobs.extend(batch)
                    logger.info("JSearch: '%s' -> %d jobs", query, len(batch))
                except Exception as exc:
                    logger.warning("JSearch failed for '%s': %s", query, exc)

        return jobs

    async def _fetch_query(self, client: httpx.AsyncClient, query: str) -> list[JobRaw]:
        params = {
            "query": query,
            "page": "1",
            "num_pages": "1",
            "date_posted": "week",
        }
        url = f"{BASE_URL}?{urlencode(params)}"
        resp = await client.get(url)

        if resp.status_code == 401 or resp.status_code == 403:
            logger.error(
                "JSearch API key rejected (HTTP %d) — check that JSEARCH_API_KEY "
                "is correctly set in Railway env vars. Response: %s",
                resp.status_code, resp.text[:300],
            )
            return []

        if resp.status_code != 200:
            logger.warning(
                "JSearch HTTP %d for query '%s': %s",
                resp.status_code, query, resp.text[:200],
            )
            return []

        data = resp.json()
        listings = data.get("data", [])
        jobs = []
        for item in listings:
            # Filter spam at source
            company = item.get("employer_name", "")
            if _is_spam_company(company):
                continue
            # Filter jobs with no description
            desc = item.get("job_description", "") or ""
            if len(desc.strip()) < 100:
                continue
            job = self._parse_listing(item)
            if job:
                jobs.append(job)
        return jobs

    def _parse_listing(self, item: dict) -> Optional[JobRaw]:
        url = item.get("job_apply_link") or item.get("job_url") or ""
        if not url:
            return None

        title = clean_title(item.get("job_title"))
        company = clean_company(item.get("employer_name"))

        city = item.get("job_city") or ""
        state = item.get("job_state") or ""
        is_remote = item.get("job_is_remote", False)
        if is_remote:
            location = "Remote"
        else:
            parts = [p for p in [city, state] if p]
            location = clean_text(", ".join(parts)) if parts else None

        sal_min = item.get("job_min_salary")
        sal_max = item.get("job_max_salary")
        sal_period_raw = item.get("job_salary_period") or "year"
        period_map = {
            "YEAR": "year", "MONTH": "month", "HOUR": "hour",
            "year": "year", "month": "month", "hour": "hour",
        }
        sal_period = period_map.get(sal_period_raw, "year")

        posted_at = None
        timestamp = item.get("job_posted_at_timestamp")
        if timestamp:
            try:
                posted_at = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
            except (ValueError, OSError):
                pass

        source_board = (item.get("job_publisher") or "jsearch").lower().replace(" ", "_")
        board_map = {
            "indeed": "indeed",
            "glassdoor": "glassdoor",
            "linkedin": "linkedin",
            "ziprecruiter": "ziprecruiter",
        }
        source = board_map.get(source_board, "jsearch")

        return JobRaw(
            title=title,
            company=company,
            location=location,
            description=clean_text(item.get("job_description")),
            source=source,
            source_url=url,
            salary_min=float(sal_min) if sal_min else None,
            salary_max=float(sal_max) if sal_max else None,
            salary_period=sal_period,
            posted_at=posted_at,
        )
