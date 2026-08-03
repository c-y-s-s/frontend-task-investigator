import os
os.environ["DATABASE_URL"] = "sqlite:///./test_investigator.db"
os.environ["GITHUB_ALLOWED_REPOS"] = "demo/frontend-agent-demo-shop"

import pytest
from fastapi.testclient import TestClient
from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value

