from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Frontend Task Investigator API"
    environment: str = "development"
    database_url: str = "sqlite:///./investigator.db"
    cors_origins: str = "http://localhost:3000"
    github_token: str | None = None
    github_allowed_repos: str = "demo/frontend-agent-demo-shop"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-terra"
    max_files: int = 10
    max_file_bytes: int = 40_000
    daily_live_limit: int = 20
    per_ip_hourly_limit: int = 3

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_repos(self) -> set[str]:
        return {item.strip().lower() for item in self.github_allowed_repos.split(",") if item.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()

