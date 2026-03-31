from app.services.scraping.sources.indeed import IndeedScraper
from app.services.scraping.sources.glassdoor import GlassdoorScraper
from app.services.scraping.sources.ziprecruiter import ZipRecruiterScraper
from app.services.scraping.sources.wellfound import WellfoundScraper
from app.services.scraping.sources.jsearch import JSearchScraper

SCRAPER_MAP = {
    "indeed": IndeedScraper,
    "glassdoor": GlassdoorScraper,
    "ziprecruiter": ZipRecruiterScraper,
    "wellfound": WellfoundScraper,
    "jsearch": JSearchScraper,
}

__all__ = ["SCRAPER_MAP"]
