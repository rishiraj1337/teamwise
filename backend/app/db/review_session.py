from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_review_engine = None
_ReviewSessionLocal = None


def get_review_engine():
    global _review_engine, _ReviewSessionLocal
    if _review_engine is None:
        settings = get_settings()
        _review_engine = create_engine(settings.review_database_url, pool_pre_ping=True)
        _ReviewSessionLocal = sessionmaker(bind=_review_engine, autoflush=False, expire_on_commit=False)
    return _review_engine


def get_review_db() -> Generator[Session, None, None]:
    get_review_engine()
    db = _ReviewSessionLocal()
    try:
        yield db
    finally:
        db.close()
