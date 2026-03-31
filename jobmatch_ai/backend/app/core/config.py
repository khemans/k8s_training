from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "JobMatch AI"
    environment: str = "development"
    secret_key: str = "change-me"

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://redis:6379"

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # Anthropic
    anthropic_api_key: str

    # ── Phase 1: Scraping ─────────────────────────────────────────────
    scrape_concurrency: int = 4
    scrape_request_timeout: int = 20
    scrape_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
    http_proxy: str = ""
    admin_api_key: str = "change-this-admin-key"
    scraper_api_key: str = ""

    # JSearch (RapidAPI) — primary job source for dev
    # Sign up at: https://rapidapi.com/letscrape-6bRB4TkqbU5/api/jsearch
    jsearch_api_key: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
