from app.database import normalize_database_url


def test_normalizes_render_postgresql_url_for_psycopg_v3():
    assert normalize_database_url("postgresql://user:pass@host/db") == "postgresql+psycopg://user:pass@host/db"


def test_normalizes_legacy_postgres_url_for_psycopg_v3():
    assert normalize_database_url("postgres://user:pass@host/db") == "postgresql+psycopg://user:pass@host/db"


def test_leaves_sqlite_url_unchanged():
    assert normalize_database_url("sqlite:///./investigator.db") == "sqlite:///./investigator.db"
