"""
match_service.py
Claude-powered job match analysis.
Sends resume text + job description to Claude and parses structured output.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import anthropic

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

MATCH_PROMPT = """You are an expert career coach and recruiter. Analyze how well a candidate's resume matches a job posting.

RESUME:
{resume_text}

JOB TITLE: {job_title}
COMPANY: {company}
JOB DESCRIPTION:
{job_description}

Analyze the match and respond ONLY with a valid JSON object in this exact structure (no markdown, no explanation):
{{
  "match_score": <integer 0-100>,
  "match_explanation": "<2-3 sentence plain-English explanation of why this is or isn't a good match>",
  "skills_gap": ["<skill or experience the candidate is missing>", ...],
  "resume_suggestions": [
    "<specific bullet point the candidate could add or rewrite to better match this job>",
    ...
  ]
}}

Scoring guide:
- 85-100: Excellent match — candidate meets nearly all requirements
- 70-84: Strong match — candidate meets most requirements with minor gaps
- 55-69: Moderate match — candidate meets core requirements but has notable gaps  
- 40-54: Weak match — significant skill or experience gaps
- 0-39: Poor match — fundamental misalignment

Keep skills_gap to the 3-5 most important missing items.
Keep resume_suggestions to 2-4 specific, actionable bullet points tailored to this exact job.
"""


async def analyze_match(
    resume_text: str,
    job_title: str,
    company: str,
    job_description: str,
) -> dict:
    """
    Call Claude to analyze job match. Returns parsed dict with:
    match_score, match_explanation, skills_gap, resume_suggestions
    """
    # Truncate inputs to stay within context limits
    resume_truncated = resume_text[:4000]
    description_truncated = (job_description or "No description available.")[:3000]

    prompt = MATCH_PROMPT.format(
        resume_text=resume_truncated,
        job_title=job_title,
        company=company,
        job_description=description_truncated,
    )

    try:
        message = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()

        # Strip any accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)

        # Validate and clamp score
        score = int(parsed.get("match_score", 0))
        score = max(0, min(100, score))

        return {
            "match_score": score,
            "match_explanation": parsed.get("match_explanation", ""),
            "skills_gap": parsed.get("skills_gap", []),
            "resume_suggestions": parsed.get("resume_suggestions", []),
            "raw_response": parsed,
        }

    except json.JSONDecodeError as e:
        logger.error("Claude returned invalid JSON for match analysis: %s", e)
        raise ValueError(f"Claude returned invalid JSON: {e}")
    except Exception as e:
        logger.error("Match analysis failed: %s", e)
        raise
