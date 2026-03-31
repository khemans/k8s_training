"""
career_url.py
Follows redirect chains from aggregator job URLs to canonical ATS / company careers pages.
Uses HEAD requests with a short timeout so it doesn't slow down the scrape pipeline.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx
import tldextract

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Known ATS and company career page domains we consider "canonical"
KNOWN_ATS_DOMAINS: frozenset[str] = frozenset({
    "greenhouse.io",
    "lever.co",
    "workday.com",
    "myworkdayjobs.com",
    "icims.com",
    "taleo.net",
    "ashbyhq.com",
    "smartrecruiters.com",
    "jobvite.com",
    "brassring.com",
    "successfactors.com",
    "successfactors.eu",
    "recruitingbypaycor.com",
    "careers-page.com",
    "bamboohr.com",
    "rippling.com",
    "hiring.amazon.com",
    "jobs.apple.com",
    "careers.google.com",
    "careers.microsoft.com",
})


async def resolve_career_url(source_url: str) -> Optional[str]:
    """
    Follow up to 5 redirects from source_url.
    Return the final URL if it lands on a known ATS domain, else None.
    Falls back gracefully on any network/timeout error.
    """
    proxy = settings.http_proxy or None
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=5,
            timeout=5.0,
            proxies=proxy,
            headers={"User-Agent": settings.scrape_user_agent},
        ) as client:
            resp = await client.head(source_url)
            final_url = str(resp.url)

        extracted = tldextract.extract(final_url)
        registered = extracted.registered_domain
        if registered in KNOWN_ATS_DOMAINS:
            return final_url

        # Also accept if the subdomain+domain combo signals a company careers page
        # e.g. careers.stripe.com, jobs.notion.so
        subdomain = extracted.subdomain.lower()
        if subdomain in ("careers", "jobs", "job", "apply", "hiring"):
            return final_url

        return None

    except Exception as exc:
        logger.debug("career_url resolution failed for %s: %s", source_url, exc)
        return None


async def resolve_batch(urls: list[str]) -> list[Optional[str]]:
    """Resolve a list of URLs concurrently."""
    import asyncio
    return await asyncio.gather(*[resolve_career_url(u) for u in urls])
