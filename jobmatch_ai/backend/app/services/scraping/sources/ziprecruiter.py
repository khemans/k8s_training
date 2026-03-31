"""
ziprecruiter.py
Scrapes ZipRecruiter via their public HTML search pages.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from app.services.scraping.normalize import JobRaw, clean_company, clean_text, clean_title, parse_salary
from app.services.scraping.sources.base import BaseScraper

logger = logging.getLogger(__name__)

SEARCH_QUERIES = [
    "software engineer remote",
    "product manager remote",
    "data scientist remote",
    "frontend engineer remote",
    "backend engineer remote",
    "devops engineer remote",
    "machine learning engineer remote",
]

BASE_URL = "https://www.ziprecruiter.com/jobs-search"


class ZipRecruiterScraper(BaseScraper):
    source = "ziprecruiter"

    async def fetch_jobs(self) -> list[JobRaw]:
        jobs: list[JobRaw] = []
        async with self._build_client() as client:
            for query in SEARCH_QUERIES:
                try:
                    batch = await self._scrape_query(client, query)
                    jobs.extend(batch)
                    logger.info("ZipRecruiter: '%s' → %d jobs", query, len(batch))
                except Exception as exc:
                    logger.warning("ZipRecruiter failed for '%s': %s", query, exc)
        return jobs

    async def _scrape_query(self, client, query: str) -> list[JobRaw]:
        params = {
            "search": query,
            "location": "United States",
            "days": 7,
            "remote": 1,
        }
        target_url = f"{BASE_URL}?{urlencode(params)}"
        url = self._scraperapi_url(target_url, render_js=True)
        resp = await client.get(url)

        if resp.status_code != 200:
            logger.warning("ZipRecruiter HTTP %d", resp.status_code)
            return []

        return self._parse_page(resp.text)

    def _parse_page(self, html: str) -> list[JobRaw]:
        soup = BeautifulSoup(html, "lxml")
        jobs: list[JobRaw] = []

        for card in soup.select("article.job_result, div[data-job-id]"):
            try:
                job = self._parse_card(card)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug("ZipRecruiter card parse error: %s", exc)

        return jobs

    def _parse_card(self, card) -> Optional[JobRaw]:
        title_el = card.select_one("h2.job_title, a.job_link")
        company_el = card.selec