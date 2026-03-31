from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()
if "postgres" not in settings.database_url:
    raise RuntimeError("Production must use PostgreSQL database")
# Convert postgres:// to postgresql+asyncpg://
db_url = settings.database_url.replace(
    "postgresql://", "postgresql+asyncpg://"
).replace("postgres://", "postgresql+asyncpg://")

engine = create_async_engine(
    db_url,
    echo=settings.environment == "development",
    pool_pre_ping=True,       # test connections before use — drops stale ones
    pool_recycle=300,          # recycle connections every 5 min
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all tables on startup, then seed required lookup rows."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_scrape_sources()


async def _seed_scrape_sources():
    """Ensure all known scrape sources exist in the scrape_sources table.
    Safe to run on every startup — uses INSERT ... ON CONFLICT DO NOTHING.
    """
    from sqlalchemy import text
    sources = ["jsearch", "indeed", "glassdoor", "ziprecruiter", "wellfound"]
    async with engine.begin() as conn:
        for source in sources:
            await conn.execute(
                text(
                    "INSERT INTO scrape_sources (source) VALUES (:source) "
                    "ON CONFLICT (source) DO NOTHING"
                ),
                {"source": source},
            )
