import re
import hashlib
from urllib.parse import urlparse, parse_qs

# import logging
# logger = logging.getLogger(__name__)

import httpx
from playwright.async_api import async_playwright

from bs4 import BeautifulSoup

# ==============================
# Detect ATS
# ==============================

def detect_ats(url: str) -> str | None:
    if "greenhouse" in url or "gh_jid" in url:
        return "greenhouse"

    if "lever.co" in url:
        return "lever"

    if "workday" in url:
        return "workday"

    if "ashbyhq.com" in url:
        return "ashby"

    if "smartrecruiters" in url:
        return "smartrecruiters"

    return None

#logger.info(f"Detected ATS: {ats}")

# ==============================
# Utility
# ==============================

def normalize_html(html: str) -> str:
    """
    Basic cleanup of returned HTML.
    You can expand this later.
    """
    return html.strip()


def generate_cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


# ==============================
# Greenhouse
# ==============================

async def fetch_greenhouse(url: str) -> str | None:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    if "gh_jid" not in qs:
        return None

    job_id = qs["gh_jid"][0]

    # Try common board patterns
    possible_boards = [
        parsed.netloc.replace("www.", ""),
        parsed.netloc.split(".")[0],
    ]

    for board in possible_boards:
        api_url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(api_url)

        if resp.status_code == 200:
            data = resp.json()
            return data.get("content")

    return None

# ==============================
# Lever
# ==============================

async def fetch_lever(url: str) -> str | None:
    parsed = urlparse(url)
    parts = parsed.path.strip("/").split("/")

    if len(parts) < 2:
        return None

    company = parts[0]
    posting_id = parts[1]

    api_url = f"https://api.lever.co/v0/postings/{company}/{posting_id}"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(api_url)

    if resp.status_code != 200:
        return None

    data = resp.json()
    return data.get("description")

# ==============================
# Unified Ingestion Function
# ==============================

async def fetch_job_description(url: str) -> str:
    ats = detect_ats(url)

    if ats == "greenhouse":
        result = await fetch_greenhouse(url)
        if result:
            return result

    if ats == "lever":
        result = await fetch_lever(url)
        if result:
            return result

    # TODO: add workday / ashby later

    # fallback
    return await fetch_with_playwright(url)

# ==============================
# Playwright Fallback
# ==============================

async def fetch_with_playwright(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        )

        page = await browser.new_page()
        await page.goto(url, timeout=60000)
        content = await page.content()
        await browser.close()

    return normalize_html(content)

# ==============================
# Extract Clean Text
# ==============================

def extract_clean_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    # Try known job containers first
    selectors = [
        ".gh-job-description",
        ".job-description",
        "#job-description",
        ".posting",
        "main"
    ]

    for selector in selectors:
        container = soup.select_one(selector)
        if container:
            text = container.get_text(separator="\n")
            lines = [line.strip() for line in text.splitlines()]
            clean_lines = [line for line in lines if line]
            return "\n".join(clean_lines)

    # fallback to full page
    return soup.get_text(separator="\n")