# JobMatch AI — Product Requirements Document (PRD)

**Status Snapshot — March 2026**

---

## 1. Product Vision

JobMatch AI is a backend-driven job ingestion and matching engine that:

1. Accepts a public job URL
2. Extracts the full job description
3. Normalizes and cleans the content
4. Stores it for downstream AI matching
5. Compares it against a candidate profile (future phase)

Primary goal: Build a scalable ingestion engine that works reliably across ATS platforms.

---

# 2. Current System Architecture

### Deployment

* Hosted on Railway
* FastAPI backend
* Dockerized (Playwright included)
* Postgres attached
* Redis attached
* Async architecture

### Current Endpoint

```
POST /api/v1/jobs/ingest
```

Request body:

```json
{
  "url": "<job-url>"
}
```

Current response:

```json
{
  "success": true,
  "content": "<extracted text>"
}
```

---

# 3. What Currently Works

## Infrastructure

* Railway deployment stable
* Docker container builds correctly
* Playwright Chromium runs in production
* Async request handling functional
* Endpoint reachable externally

## Ingestion Flow (Current)

```
User URL
   ↓
ATS detection (basic string matching)
   ↓
If ATS supported → try API
   ↓
Else → Playwright render
   ↓
BeautifulSoup cleanup
   ↓
Return text
```

## Supported ATS (Partial)

* Greenhouse (API attempt implemented)
* Lever (API implementation added)
* Workday (planned)
* Ashby (planned)
* SmartRecruiters (planned)

---

# 4. Current Problem State

Greenhouse job URLs embedded inside company career pages (e.g., ?gh_jid=XXXXX):

* ATS detection triggers
* Greenhouse API attempt runs
* API call does NOT return job content
* System falls back to Playwright
* Playwright returns full page wrapper content
* Extraction returns:

  * Page header text
  * Career landing content
  * NOT isolated job description

Result:
"Add from URL" does not reliably return a clean Greenhouse job description.

---

# 5. Root Cause Identified

Greenhouse embedded jobs require:

* Correct board name
* Correct job ID
* Correct API endpoint

Current implementation guesses board name from domain, which fails when:

* Company uses embedded Greenhouse job board
* Domain ≠ greenhouse board slug
* Board slug must be discovered dynamically

Therefore:
Greenhouse API call fails silently and system falls back to HTML scraping.

---

# 6. Current Technical Debt

1. No reliable board slug discovery for Greenhouse
2. No structured job object (title/company/location not parsed)
3. No persistence layer storing job objects
4. No ingestion caching
5. Logging is minimal
6. Fallback HTML extraction still too broad
7. No retry logic per ATS

---

# 7. Architecture Direction (Option B)

Target Architecture:

```
User URL
   ↓
ATS Detector
   ↓
ATS-Specific API Adapter
   ↓
Structured Job Object
   ↓
Store in Postgres
   ↓
Return normalized JSON
```

Key Principle:
API-first ingestion. Scraping is fallback only.

---

# 8. Definition of "Working"

Greenhouse ingestion is considered working when:

* Given any public Greenhouse job URL
* System:

  * Correctly detects ATS
  * Resolves board slug
  * Calls official API
  * Returns structured JSON:
    {
    title,
    company,
    location,
    description_html,
    description_text
    }

No HTML wrapper content.

---

# 9. Current Phase

Infrastructure: Stable
Playwright: Operational
ATS Detection: Basic
Greenhouse: Partially implemented, not production ready
Lever: Implemented but not tested
Persistence: Not implemented
Structured responses: Not implemented

We are at:

Phase 2 — ATS Ingestion Hardening

---

# 10. Immediate Next Engineering Tasks

Priority 1:

* Implement dynamic Greenhouse board discovery
* Log API response failures
* Prevent silent fallback without error signal

Priority 2:

* Convert ingestion output to structured job schema
* Save job record to Postgres
* Add ingestion status logging

Priority 3:

* Add Lever validation test
* Add Workday adapter

---

# 11. Risks

* Greenhouse embed patterns vary by company
* Workday endpoints differ across tenants
* Rate limits on ATS APIs
* Scraping fallback may get blocked at scale

---

# 12. Strategic Objective

Transform ingestion system from:

"Brittle scraper"

Into:

"Modular ATS ingestion engine with fallback rendering"

This becomes the foundation for:

* Resume matching
* Job feed indexing
* Public job ingestion API
* SaaS product

---

# End of Status Snapshot

System is functional at infrastructure level.
Greenhouse ingestion is not yet production reliable.
Architecture direction is correct.
Implementation needs ATS hardening layer.
