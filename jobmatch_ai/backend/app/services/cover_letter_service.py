"""
cover_letter_service.py
Claude-powered cover letter generator.
Supports streaming so the letter appears word-by-word in the UI.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator

import anthropic

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

TONE_INSTRUCTIONS = {
    "professional": "Write in a polished, formal professional tone. Confident but not arrogant.",
    "conversational": "Write in a warm, friendly, and natural tone — like a confident person talking, not a robot. Avoid stiff corporate language.",
    "enthusiastic": "Write with genuine excitement and energy about the role and company. Let the passion come through without being over the top.",
    "concise": "Be brief and direct. No fluff. Every sentence must earn its place. Aim for 3 tight paragraphs.",
}

COVER_LETTER_PROMPT = """You are an expert career coach writing a cover letter for a job applicant.

CANDIDATE RESUME:
{resume_text}

JOB TITLE: {job_title}
COMPANY: {company}
JOB DESCRIPTION:
{job_description}

TONE: {tone_instruction}

Write a cover letter for this candidate applying to this role. Follow these rules:
- Address it to "Hiring Manager" (no date or address block needed)
- Opening paragraph: hook — connect the candidate's background to what makes this role compelling to them
- Middle paragraph(s): 2-3 specific, quantified accomplishments from the resume that directly address what the job requires. Do NOT just restate the resume — show WHY these experiences make them a strong fit for THIS job.
- Closing paragraph: clear call to action, express enthusiasm for next steps
- Sign off with "Sincerely," followed by the candidate's name (extract from resume)
- Length: 3-4 paragraphs, roughly 250-350 words
- Do NOT use generic filler phrases like "I am writing to apply", "I am a quick learner", "I am passionate about"
- Do NOT include placeholders like [Your Name] or [Date]

Write ONLY the cover letter. No preamble, no explanation.
"""


async def generate_cover_letter_stream(
    resume_text: str,
    job_title: str,
    company: str,
    job_description: str,
    tone: str = "professional",
) -> AsyncIterator[str]:
    """
    Stream a cover letter token by token.
    Yields text chunks as they arrive from Claude.
    """
    tone_instruction = TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["professional"])

    # Truncate inputs to stay within context limits
    resume_truncated = resume_text[:4000]
    description_truncated = (job_description or "No description provided.")[:3000]

    prompt = COVER_LETTER_PROMPT.format(
        resume_text=resume_truncated,
        job_title=job_title,
        company=company,
        job_description=description_truncated,
        tone_instruction=tone_instruction,
    )

    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            yield text


async def generate_cover_letter(
    resume_text: str,
    job_title: str,
    company: str,
    job_description: str,
    tone: str = "professional",
) -> str:
    """
    Generate a cover letter and return the full text (non-streaming).
    Used for saving/downloading.
    """
    chunks = []
    async for chunk in generate_cover_letter_stream(
        resume_text=resume_text,
        job_title=job_title,
        company=company,
        job_description=job_description,
        tone=tone,
    ):
        chunks.append(chunk)
    return "".join(chunks)
