"""
wellfound.py
Scrapes Wellfound (formerly AngelList) via their public GraphQL endpoint.
Wellfound is the best source for startup roles.
"""
from __future__ import annotations

import json as json_lib
import logging
from datetime import datetime
from typing import Optional

from app.services.scraping.normalize import JobRaw, clean_company, clean_text, clean_title, parse_salary
from app.services.scraping.sources.base import BaseScraper

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://wellfound.com/graphql"

ROLE_QUERIES = [
    "software-engineer",
    "product-manager",
    "data-scientist",
    "frontend-engineer",
    "backend-engineer",
    "devops-engineer",
    "machine-learning-engineer",
    "designer",
]

JOBS_QUERY = """
query StartupJobsSearch($role: String!, $page: Int!) {
  startupJobsSearch(role: $role, page: $page, remote: true) {
    startupJobs {
      id
      title
      slug
      description
      locationNames
      compensation
      createdAt
      liveStartAt
      startup {
        name
        website
      }
    }
    totalCount
  }
}
"""


class WellfoundScraper(BaseScraper):
    source = "wellfound"

    async def fetch_jobs(self) -> list[JobRaw]:
        jobs: list[JobRaw] = []
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Referer": "https://wellfound.com/jobs",
            "Origin": "https://wellfound.com",
        }
        async with self._build_client(extra_headers=headers) as client:
            for role in ROLE_QUERIES:
                try:
                    batch = await self._fetch_role(client, role)
                    jobs.extend(batch)
                    logger.info("Wellfound: role='%s' → %d jobs", role, len(batch))
                except Exception as exc:
                    logger.warning("Wellfound failed for role '%s': %s", role, exc)
        return jobs

    async def _fetch_role(self, client, role: str, pages: int = 2) -> list[JobRaw]:
        jobs = []
        for page in range(1, pages + 1):
            payload = {
                "query": JOBS_QUERY,
                "variables": {"role": role, "page": page},
            }
            scraper_url = self._scraperapi_url(GRAPHQL_URL)
            resp = await client.post(
                scraper_url,
                content=json_lib.dumps(payload),
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                logger.warning("Wellfound GraphQL HTTP %d", resp.status_code)
                break
            data = resp.json()
            search = (
                data.get("data", {}).get("startupJobsSearch", {})
                or {}
            )
            listings = search.get("startupJobs", [])
            for item in listings:
                job = self._parse_item(item)
                if job:
                    jobs.append(job)
            if len(listings) < 10:
                break
        return jobs

    def _parse_item(self, item: dict) -> Optional[JobRaw]:
        slug = item.get("slug") or item.get("id", "")
        url = f"https://wellfound.com/jobs/{slug}" if slug else ""
        if not url:
            return None

        title = clean_title(item.get("title"))
        startup = item.get("startup", {}) or {}
        company = clean_company(startup.get("name"))

        locations = item.get("locationNames", [])
        location = clean_text(", ".join(locations) if locations else None)

        sal_min, sal_max, sal_period = parse_salary(item.get("compensation"))

        posted_at = None
        raw_date = item.get("liveStartAt") or item.get("createdAt")
        if raw_date:
            try:
                posted_at = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
            except ValueError:
                pass

        return JobRaw(
            title=title,
            company=company,
            location=location,
            description=clean_text(item.get("description")),
            source=self.source,
            source_url=url,
            salary_min=sal_min,
            salary_max=sal_max,
            salary_period=sal_period,
            posted_at=posted_at,
        )
