"""
url_job_extractor.py
Fetch a URL and extract job title, company, description for tracker "Add from URL".
Strategy:
  1. Fast httpx fetch → JSON-LD / meta extraction
  2. If content is thin (JS-rendered ATS like iCIMS, Workday, Greenhouse) → Playwright headless fetch
  3. Claude AI extraction as final fallback for any remaining gaps
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

# ATS platforms known to require JS rendering
JS_RENDERED_DOMAINS = {
    "icims.com", "greenhouse.io", "lever.co", "workday.com",
    "myworkdayjobs.com", "taleo.net", "successfactors.com",
    "jobvite.com", "smartrecruiters.com", "ashbyhq.com",
    "rippling.com", "bamboohr.com",
}


@dataclass
class ExtractedJob:
    title: str
    company: str
    location: Optional[str]
    description: Optional[str]
    source_url: str


def _normalize_url(url: str) -> str:
    u = url.strip()
    if u and not u.startswith(("http://", "https://")):
        u = "https://" + u
    parsed = urlparse(u)
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc.lower()}{path}"


def _company_from_domain(netloc: str) -> str:
    parts = netloc.lower().replace("www.", "").split(".")
    for skip in ("careers", "jobs", "job", "recruiting", "apply", "work"):
        if parts[0] == skip and len(parts) > 1:
            parts = parts[1:]
            break
    name = parts[0] if parts else "Unknown"
    return name.replace("-", " ").title()


def _is_js_rendered_ats(url: str) -> bool:
    """Check if the URL is from a known JS-rendered ATS platform."""
    netloc = urlparse(url).netloc.lower()
    return any(domain in netloc for domain in JS_RENDERED_DOMAINS)


def _content_is_thin(extracted: Optional[ExtractedJob]) -> bool:
    """Returns True if we didn't get meaningful job content."""
    if extracted is None:
        return True
    if not extracted.description or len(extracted.description.strip()) < 200:
        return True
    return False


def _extract_json_ld_job(soup: BeautifulSoup) -> Optional[ExtractedJob]:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "{}")
        except json.JSONDecodeError:
            continue
        items = [data] if isinstance(data, dict) else (data if isinstance(data, list) else [])
        for item in items:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                title = (item.get("title") or "").strip() or None
                desc = (item.get("description") or "").strip() or None
                org = item.get("hiringOrganization")
                company = (org.get("name") or "").strip() if isinstance(org, dict) else None
                loc = item.get("jobLocation")
                location = None
                if isinstance(loc, dict):
                    loc_addr = loc.get("address")
                    if isinstance(loc_addr, dict):
                        location = (loc_addr.get("addressLocality") or loc_addr.get("addressRegion") or "").strip() or None
                if title and company:
                    return ExtractedJob(title=title, company=company, location=location, description=desc, source_url="")
    return None


def _extract_meta(soup: BeautifulSoup, url: str) -> Optional[ExtractedJob]:
    title = description = company = None
    for meta in soup.find_all("meta", property=re.compile(r"^og:")):
        prop = meta.get("content", "").strip()
        p = (meta.get("property") or "").lower()
        if p == "og:title":
            title = prop
        elif p == "og:description":
            description = prop
        elif p == "og:site_name":
            company = prop
    if not title:
        t = soup.find("title")
        if t and t.string:
            title = t.string.strip()
    if not company:
        company = _company_from_domain(urlparse(url).netloc)
    if title and company:
        return ExtractedJob(title=title[:500], company=company[:500], location=None,
                            description=description[:10000] if description else None, source_url="")
    return None


async def _fetch_with_playwright(url: str) -> str:
    """Use a headless browser to render JS and return the full HTML."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=USER_AGENT)
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            # Extra wait for ATS platforms that load content after networkidle
            await page.wait_for_timeout(2000)
            html = await page.content()
        finally:
            await browser.close()
    return html


async def _extract_with_claude(html: str, url: str) -> Optional[ExtractedJob]:
    """Use Claude to extract structured job info from raw HTML text."""
    from app.core.config import get_settings
    import anthropic

    settings = get_settings()
    soup = BeautifulSoup(html, "lxml")

    # Strip scripts/styles and get clean text (cap at 12k chars for Claude)
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    page_text = soup.get_text(separator="\n", strip=True)[:12000]

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    prompt = f"""Extract job posting information from this webpage text. Return ONLY valid JSON with these exact keys:
{{
  "title": "job title or null",
  "company": "company name or null",
  "location": "location or null",
  "description": "full job description text or null"
}}

If you cannot find a value, use null. Do not include any other text.

Webpage URL: {url}
Webpage text:
{page_text}"""

    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```json\s*|^```\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Claude returned non-JSON for URL extraction: %s", raw[:200])
        return None

    title = (data.get("title") or "").strip() or None
    company = (data.get("company") or "").strip() or None
    if not company:
        company = _company_from_domain(urlparse(url).netloc)
    if not title:
        return None

    return ExtractedJob(
        title=title,
        company=company or "Unknown",
        location=(data.get("location") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        source_url="",
    )


async def fetch_and_extract(url: str) -> ExtractedJob:
    """
    Fetch URL and extract job info.
    Uses fast httpx first, falls back to Playwright (JS rendering) + Claude for ATS sites.
    """
    normalized = _normalize_url(url)
    if not normalized.startswith(("http://", "https://")):
        raise ValueError("Invalid URL")

    html: Optional[str] = None
    final_url = normalized

    # ── Step 1: Fast HTTP fetch ───────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=15.0,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            resp = await client.get(normalized)
            resp.raise_for_status()
            html = resp.text
            final_url = str(resp.url)
    except httpx.HTTPError as e:
        logger.warning("Fast fetch failed for %s: %s", normalized[:80], e)

    # ── Step 2: Try structured extraction from fast-fetched HTML ─────────────
    extracted: Optional[ExtractedJob] = None
    if html:
        soup = BeautifulSoup(html, "lxml")
        extracted = _extract_json_ld_job(soup)
        if not extracted:
            extracted = _extract_meta(soup, final_url)

    # ── Step 3: If content is thin, use Playwright for JS rendering ──────────
    if _content_is_thin(extracted) and (_is_js_rendered_ats(final_url) or _content_is_thin(extracted)):
        logger.info("Content thin for %s, trying Playwright JS render", final_url[:80])
        try:
            rendered_html = await _fetch_with_playwright(final_url)
            soup = BeautifulSoup(rendered_html, "lxml")
            extracted = _extract_json_ld_job(soup)
            if not extracted:
                extracted = _extract_meta(soup, final_url)
            # If still thin after JS render, use Claude
            if _content_is_thin(extracted):
                logger.info("Still thin after JS render, using Claude extraction for %s", final_url[:80])
                extracted = await _extract_with_claude(rendered_html, final_url)
        except Exception as e:
            logger.warning("Playwright render failed for %s: %s", final_url[:80], e)
            # Fall through to Claude with original HTML if available
            if html and _content_is_thin(extracted):
                try:
                    extracted = await _extract_with_claude(html, final_url)
                except Exception as ce:
                    logger.warning("Claude extraction also failed: %s", ce)

    # ── Step 4: Final fallback ────────────────────────────────────────────────
    if not extracted:
        title = "Imported Job"
        if html:
            soup = BeautifulSoup(html, "lxml")
            t = soup.find("title")
            if t and t.string:
                title = t.string.strip()[:500]
        return ExtractedJob(
            title=title,
            company=_company_from_domain(urlparse(final_url).netloc),
            location=None,
            description=None,
            source_url=final_url,
        )

    extracted.source_url = final_url
    return extracted