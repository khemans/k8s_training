"""
glassdoor.py
Scrapes Glassdoor job listings via their public HTML search pages.
Glassdoor requires cookie-consent headers and uses JS rendering for full listings,
so we extract from the embedded __NEXT_DATA__ JSON blob where available.
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

SEARCH_QUERIES = [
    ("software engineer", "remote"),
    ("product manager", "remote"),
    ("data scientist", "remote"),
    ("frontend developer", "remote"),
    ("backend developer", "remote"),
]

BASE_URL = "https://www.glassdoor.com/Job/jobs.htm"


class GlassdoorScraper(BaseScraper):
    source = "glassdoor"

    async def fetch_jobs(self) -> list[JobRaw]:
        jobs: list[JobRaw] = []
        # Glassdoor needs cookie consent header to avoid redirect loop
        headers = {
            "Cookie": "trs=direct:direct:direct:20240101:undefined:undefined",
            "Referer": "https://www.glassdoor.com/",
        }
        async with self._build_client(extra_headers=headers) as client:
            for query, location in SEARCH_QUERIES:
                try:
                    batch = await self._scrape_query(client, query, location)
                    jobs.extend(batch)
                    logger.info("Glassdoor: '%s' → %d jobs", query, len(batch))
                except Exception as exc:
                    logger.warning("Glassdoor scrape failed for '%s': %s", query, exc)
        return jobs

    async def _scrape_query(self, client, query: str, location: str) -> list[JobRaw]:
        params = {
            "sc.keyword": query,
            "locT": "N",
            "locId": "1",   # United States
            "fromAge": 7,
        }
        url = f"{BASE_URL}?{urlencode(params)}"
        resp = await client.get(url)
        if resp.status_code != 200:
            logger.warning("Glassdoor HTTP %d for %s", resp.status_code, url)
            return []
        return self._parse_page(resp.text)

    def _parse_page(self, html: str) -> list[JobRaw]:
        soup = BeautifulSoup(html, "lxml")

        # ── Strategy 1: __NEXT_DATA__ JSON blob ──────────────────────
        next_data_tag = soup.find("script", id="__NEXT_DATA__")
        if next_data_tag:
            try:
                data = json.loads(next_data_tag.string or "")
                jobs = self._from_next_data(data)
                if jobs:
                    return jobs
            except Exception as exc:
                logger.debug("Glassdoor __NEXT_DATA__ parse failed: %s", exc)

        # ── Strategy 2: CSS selector fallback ────────────────────────
        jobs: list[JobRaw] = []
        for card in soup.select("li.react-job-listing, div[data-test='jobListing']"):
            try:
                job = self._from_card(card)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug("Glassdoor card parse error: %s", exc)
        return jobs

    def _from_next_data(self, data: dict) -> list[JobRaw]:
        """Walk the Next.js page props to find job listings."""
        jobs = []
        try:
            props = data["props"]["pageProps"]
            # Different Glassdoor page versions store jobs at different paths
            listings = (
                props.get("jobListings", {}).get("jobListings")
                or props.get("jobs")
                or props.get("jobList", {}).get("jobListings")
                or []
            )
            for item in listings:
                job = self._parse_next_item(item)
                if job:
                    jobs.append(job)
        except (KeyError, TypeError):
            pass
        return jobs

    def _parse_next_item(self, item: dict) -> Optional[JobRaw]:
        listing = item.get("jobview", {}).get("job", {}) or item
        title = clean_title(listing.get("jobTitleText") or listing.get("title"))
        company = clean_company(
            listing.get("employerNameFromSearch")
            or listing.get("employer", {}).get("name")
            or listing.get("companyName")
        )
        location = clean_text(listing.get("locationName") or listing.get("location"))
        job_url = listing.get("jobListingId") or listing.get("listingId")
        if job_url:
            url = f"https://www.glassdoor.com/job-listing/j?jl={job_url}"
        else:
            url = listing.get("applyUrl") or listing.get("jobUrl") or ""

        if not url:
            return None

        posted_raw = listing.get("listingDateText") or listing.get("discoveryDate")
        posted_at = None
        if posted_raw:
            try:
                posted_at = datetime.fromisoformat(str(posted_raw).replace("Z", "+00:00"))
            except ValueError:
                pass

        sal_text = listing.get("salaryRangeText") or listing.get("salary")
        sal_min, sal_max, sal_period = parse_salary(sal_text)

        return JobRaw(
            title=title,
            company=company,
            location=location,
            source=self.source,
            source_url=url,
            salary_min=sal_min,
            salary_max=sal_max,
            salary_period=sal_period,
            posted_at=posted_at,
        )

    def _from_card(self, card) -> Optional[JobRaw]:
        title_el = card.select_one("[data-test='job-title'], .job-title")
        company_el = card.select_one("[data-test='employer-name'], .employer-name")
        location_el = card.select_one("[data-test='emp-location'], .location")
        link_el = card.select_one("a[href*='/partner/jobListing'], a[data-test='job-title']")

        title = clean_title(title_el.get_text() if title_el else None)
        company = clean_company(company_el.get_text() if company_el else None)
        location = clean_text(location_el.get_text() if location_el else None)
        href = link_el.get("href", "") if link_el else ""
        url = href if href.startswith("http") else f"https://www.glassdoor.com{href}"
        if not href:
            return None

        return JobRaw(
            title=title,
            company=company,
            location=location,
            source=self.source,
            source_url=url,
        )
