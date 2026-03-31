"""
base.py
Abstract base class all scrapers inherit from.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import httpx

from app.core.config import get_settings
from app.services.scraping.normalize import JobRaw

settings = get_settings()
logger = logging.getLogger(__name__)

# Shared headers that make requests look like a real browser
DEFAULT_HEADERS = {
    "User-Agent": settings.scrape_user_agent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "DNT": "1",
}


class BaseScraper(ABC):
    source: str = ""

    def _build_client(self, extra_headers: dict | None = None) -> httpx.AsyncClient:
        headers = {**DEFAULT_HEADERS, **(extra_headers or {})}

        api_key = getattr(settings, "scraper_api_key", "")
        if api_key:
            proxy_url = f"http://scraperapi:{api_key}@proxy-server.scraperapi.com:8001"
            return httpx.AsyncClient(
                headers=headers,
                timeout=60.0,
                follow_redirects=True,
                proxies={"http://": proxy_url, "https://": proxy_url},
                verify=False,
            )

        proxy = settings.http_proxy or None
        return httpx.AsyncClient(
            headers=headers,
            timeout=settings.scrape_request_timeout,
            follow_redirects=True,
            proxies=proxy,
        )
    def _scraperapi_url(self, target_url: str, render_js: bool = False) -> str:
        from urllib.parse import quote
        api_key = getattr(settings, "scraper_api_key", "")
        if not api_key:
            return target_url
        encoded = quote(target_url, safe="")
        params = f"api_key={api_key}&url={encoded}"
        if render_js:
            params += "&render=true"
        return f"https://api.scraperapi.com/?{params}"

    @abstractmethod
    async def fetch_jobs(self) -> list[JobRaw]:
        """Fetch and return a list of normalised JobRaw objects."""
        ...
