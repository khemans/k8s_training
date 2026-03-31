import io
import json
import logging
import pdfplumber
from docx import Document as DocxDocument
import anthropic

from app.core.config import get_settings

settings = get_settings()
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
logger = logging.getLogger(__name__)

PARSE_PROMPT = """You are a resume parser. Extract structured information from the resume text below.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation, no code fences):
{
  "full_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "string or null",
  "skills": {
    "technical": ["list of technical skills"],
    "soft": ["list of soft skills"],
    "domain": ["list of domain/industry skills"]
  },
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "start_date": "Month Year or Year",
      "end_date": "Month Year, Year, or Present",
      "duration_months": 12,
      "location": "string or null",
      "highlights": ["key accomplishments as bullet strings"],
      "inferred_impact": "one sentence describing the level of impact"
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string or null",
      "field": "string or null"
    }
  ],
  "certifications": ["list of certifications"],
  "strengths": ["3-5 inferred professional strengths"],
  "career_trajectory": "one paragraph describing career arc and direction",
  "inferred_seniority": "entry | mid | senior | lead | manager | director | executive",
  "suggested_roles": ["4-6 role titles this person would be competitive for"],
  "confidence_score": 0.95
}

Important: duration_months and confidence_score must be numbers, not strings.
Return ONLY the JSON object. No explanation, no markdown, no code fences.

Resume text:
"""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n\n".join(text_parts)


def extract_text_from_docx(file_bytes: bytes) -> str:
    doc = DocxDocument(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def parse_resume_with_claude(raw_text: str) -> dict:
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": PARSE_PROMPT + raw_text}]
    )

    content = message.content[0].text.strip()
    logger.info(f"Claude response preview: {content[:300]}")

    # Strip markdown code fences if Claude included them despite instructions
    if "```" in content:
        start = content.find("```")
        end = content.rfind("```")
        if start != end:
            content = content[start+3:end].strip()
            if content.startswith("json"):
                content = content[4:].strip()

    # Find the outermost JSON object in case there's any surrounding text
    brace_start = content.find("{")
    brace_end = content.rfind("}")
    if brace_start != -1 and brace_end != -1:
        content = content[brace_start:brace_end+1]

    try:
        parsed = json.loads(content)
        logger.info(f"Parse successful, confidence: {parsed.get('confidence_score')}")
        return parsed
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode failed: {e}")
        logger.error(f"Content that failed:\n{content[:500]}")
        raise


def extract_text(file_bytes: bytes, content_type: str) -> tuple[str, str]:
    if content_type == "application/pdf" or content_type.endswith("/pdf"):
        return extract_text_from_pdf(file_bytes), "pdf"
    elif content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        return extract_text_from_docx(file_bytes), "docx"
    else:
        return file_bytes.decode("utf-8", errors="ignore"), "text"
