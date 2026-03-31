"""
normalize.py
Shared dataclass and field-mapping helpers used by all scrapers.
Every scraper converts its raw data into a JobRaw before hitting the DB.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class JobRaw:
    title: str
    company: str
    source: str           # 'indeed' | 'glassdoor' | 'ziprecruiter' | 'wellfound'
    source_url: str
    location: Optional[str] = None
    description: Optional[str] = None
    career_page_url: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = "USD"
    salary_period: str = "year"   # 'year' | 'hour' | 'month'
    posted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    def salary_range_dict(self) -> dict:
        return {
            "min": self.salary_min,
            "max": self.salary_max,
            "currency": self.salary_currency,
            "period": self.salary_period,
        }


# ── Text helpers ──────────────────────────────────────────────────────────────

def clean_text(text: Optional[str]) -> Optional[str]:
    """Strip excess whitespace and normalize unicode spaces."""
    if not text:
        return None
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def clean_title(title: Optional[str]) -> str:
    """Normalize a job title: strip trailing company name noise."""
    if not title:
        return "Unknown Title"
    title = clean_text(title) or "Unknown Title"
    # Strip patterns like " - Company Name" or " at Company Name" appended by boards
    title = re.sub(r"\s*[-–|]\s*.{2,40}$", "", title).strip()
    return title or "Unknown Title"


def clean_company(company: Optional[str]) -> str:
    if not company:
        return "Unknown Company"
    return clean_text(company) or "Unknown Company"


# ── Salary parsing ────────────────────────────────────────────────────────────

_SALARY_RE = re.compile(
    r"\$?([\d,]+(?:\.\d+)?)[kK]?\s*(?:[-–to]+\s*\$?([\d,]+(?:\.\d+)?)[kK]?)?"
)
_PERIOD_MAP = {
    "hr": "hour", "hour": "hour", "/hr": "hour", "per hour": "hour",
    "yr": "year", "year": "year", "/yr": "year", "per year": "year", "annually": "year",
    "mo": "month", "month": "month", "/mo": "month", "per month": "month",
}


def parse_salary(raw: Optional[str]) -> tuple[Optional[float], Optional[float], str]:
    """
    Parse a free-text salary string into (min, max, period).
    Returns (None, None, 'year') if unparseable.
    """
    if not raw:
        return None, None, "year"

    raw_lower = raw.lower()
    period = "year"
    for key, val in _PERIOD_MAP.items():
        if key in raw_lower:
            period = val
            break

    matches = _SALARY_RE.findall(raw)
    if not matches:
        return None, None, period

    def parse_num(s: str) -> float:
        s = s.replace(",", "")
        val = float(s)
        # $80k → 80000
        if "k" in raw_lower[raw_lower.find(s) : raw_lower.find(s) + len(s) + 1]:
            val *= 1000
        return val

    try:
        first = matches[0]
        lo = parse_num(first[0]) if first[0] else None
        hi = parse_num(first[1]) if first[1] else lo
        return lo, hi, period
    except (ValueError, IndexError):
        return None, None, period
