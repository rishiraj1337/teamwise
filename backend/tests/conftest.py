import os

os.environ.setdefault("MYSQL_PASSWORD", "test-database-password")
os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key-with-at-least-32-characters")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Department, Permission, Role, RolePermission, User, UserRole  # noqa: F401
from app.services.seed import seed_rbac_if_empty

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def client():
    Base.metadata.create_all(bind=test_engine)
    with TestingSessionLocal() as seed_session:
        seed_rbac_if_empty(seed_session)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)

