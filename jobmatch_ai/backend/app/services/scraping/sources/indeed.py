"""
indeed.py
Scrapes Indeed job listings using their public HTML search pages.
Prefers JSON-LD <script> blocks; falls back to CSS selectors.
Kept to 3 queries x 1 page to stay within ARQ's 300s job timeout.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from app.services.scraping.normalize import JobRaw, clean_company, clean_text, clean_title, parse_salary
from app.services.scraping.sources.base import BaseScraper

logger = logging.getLogger(__name__)

# Kept small — each ScraperAPI JS-render request takes ~10-20s
SEARCH_QUERIES = [
    ("software engineer", "remote"),
    ("product manager", "remote"),
    ("data scientist", "remote"),
]

BASE_URL = "https://www.indeed.com/jobs"


class IndeedScraper(BaseScraper):
    source = "indeed"

    async def fetch_jobs(self) -> list[JobRaw]:
        jobs: list[JobRaw] = []
        async with self._build_client() as client:
            for query, location in SEARCH_QUERIES:
                try:
                    batch = await self._scrape_query(client, query, location)
                    jobs.extend(batch)
                    logger.info("Indeed: '%s' in '%s' -> %d jobs", query, location, len(batch))
                except Exception as exc:
                    logger.warning("Indeed scrape failed for query '%s': %s", query, exc)
        return jobs

    async def _scrape_query(
        self, client, query: str, location: str, pages: int = 1
    ) -> list[JobRaw]:
        jobs: list[JobRaw] = []
        for page in range(pages):
            params = {
                "q": query,
                "l": location,
                "start": page * 10,
                "fromage": 7,
            }
            url = f"{BASE_URL}?{urlencode(params)}"
            resp = await client.get(self._scraperapi_url(url, render_js=True))
            if resp.status_code != 200:
                logger.warning("Indeed HTTP %d for %s", resp.status_code, url)
                break
            batch = self._parse_page(resp.text)
            jobs.extend(batch)
            if len(batch) < 10:
                break
        return jobs

    def _parse_page(self, html: str) -> list[JobRaw]:
        soup = BeautifulSoup(html, "lxml")
        jobs: list[JobRaw] = []

        # Strategy 1: JSON-LD blocks
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, list):
                    for item in data:
                        job = self._from_jsonld(item)
                        if job:
                            jobs.append(job)
                elif isinstance(data, dict):
                    job = self._from_jsonld(data)
                    if job:
                        jobs.append(job)
            except (json.JSONDecodeError, Exception):
                continue

        if jobs:
            return jobs

        # Strategy 2: CSS selector fallback
        for card in soup.select("div.job_seen_beacon, div[data-jk]"):
            try:
                job = self._from_card(card)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug("Indeed card parse error: %s", exc)

        return jobs

    def _from_jsonld(self, data: dict) -> Optional[JobRaw]:
        if data.get("@type") != "JobPosting":
            return None
        title = clean_title(data.get("title"))
        org = data.get("hiringOrganization", {})
        company = clean_company(org.get("name") if isinstance(org, dict) else None)
        location_obj = data.get("jobLocation", {})
        if isinstance(location_obj, list):
            location_obj = location_obj[0] if location_obj else {}
        addr = location_obj.get("address", {}) if isinstance(location_obj, dict) else {}
        location = clean_text(
            addr.get("addressLocality", "") + (", " + addr.get("addressRegion", "") if addr.get("addressRegion") else "")
            if isinstance(addr, dict) else str(addr)
        )
        url = data.get("url") or data.get("identifier", {}).get("value", "")
        if not url:
            return None

        salary_raw = None
        sal = data.get("baseSalary", {})
        if isinstance(sal, dict):
            val = sal.get("value", {})
            if isinstance(val, dict):
                lo = val.get("minValue")
                hi = val.get("maxValue")
                salary_raw = f"${lo}-${hi}" if lo and hi else (f"${lo}" if lo else None)

        sal_min, sal_max, sal_period = parse_salary(salary_raw)

        posted_raw = data.get("datePosted")
        posted_at = None
        if posted_raw:
            try:
                posted_at = datetime.fromisoformat(posted_raw.replace("Z", "+00:00"))
            except ValueError:
                pass

        return JobRaw(
            title=title,
            company=company,
            location=location,
            description=clean_text(data.get("description")),
            source=self.source,
            source_url=url if url.startswith("http") else f"https://www.indeed.com{url}",
            salary_min=sal_min,
            salary_max=sal_max,
            salary_period=sal_period,
            posted_at=posted_at,
        )

    def _from_card(self, card) -> Optional[JobRaw]:
        title_el = card.select_one("h2.jobTitle span, a.jcs-JobTitle span")
        company_el = card.select_one("[data-testid='company-name'], .companyName")
        location_el = card.select_one("[data-testid='text-location'], .companyLocation")
        link_el = card.select_one("a[data-jk], a.jcs-JobTitle")

        title = clean_title(title_el.get_text() if title_el else None)
        company = clean_company(company_el.get_text() if company_el else None)
        location = clean_text(location_el.get_text() if location_el else None)

        href = link_el.get("href", "") if link_el else ""
        url = href if href.startswith("http") else f"https://www.indeed.com{href}"
        if not href:
            return None

        return JobRaw(
            title=title,
            company=company,
            location=location,
            source=self.source,
            source_url=url,
        )