import base64
import re
import time
import httpx
from .config import Settings


class GitHubToolError(RuntimeError):
    pass


class GitHubClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = httpx.Client(
            base_url="https://api.github.com",
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                **({"Authorization": f"Bearer {settings.github_token}"} if settings.github_token else {}),
            },
            timeout=15,
        )

    def _ensure_allowed(self, repository: str) -> None:
        if repository.lower() not in self.settings.allowed_repos:
            raise GitHubToolError("Repository is not in the live-mode allowlist")

    def _get(self, path: str, params: dict | None = None) -> dict | list:
        response = self.client.get(path, params=params)
        if response.status_code == 404:
            raise GitHubToolError("GitHub resource was not found or token access is missing")
        if response.status_code == 403:
            raise GitHubToolError("GitHub rate limit or permission denied")
        response.raise_for_status()
        return response.json()

    def get_issue(self, repository: str, issue_number: int) -> dict:
        self._ensure_allowed(repository)
        data = self._get(f"/repos/{repository}/issues/{issue_number}")
        return {"number": data["number"], "title": data["title"], "body": data.get("body") or "", "url": data["html_url"], "labels": [label["name"] for label in data.get("labels", [])]}

    def search_repository(self, repository: str, terms: list[str]) -> list[dict]:
        self._ensure_allowed(repository)
        results: list[dict] = []
        seen: set[str] = set()
        for term in terms[:6]:
            data = self._get("/search/code", {"q": f"{term} repo:{repository}"})
            for item in data.get("items", [])[:8]:
                path = item["path"]
                if self._safe_path(path) and path not in seen:
                    seen.add(path)
                    results.append({"path": path, "url": item["html_url"]})
        return results[: self.settings.max_files]

    def read_repository_files(self, repository: str, branch: str, paths: list[str]) -> list[dict]:
        self._ensure_allowed(repository)
        files = []
        for path in paths[: self.settings.max_files]:
            if not self._safe_path(path):
                continue
            data = self._get(f"/repos/{repository}/contents/{path}", {"ref": branch})
            if data.get("size", 0) > self.settings.max_file_bytes or data.get("encoding") != "base64":
                continue
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            files.append({"path": path, "content": content, "url": data["html_url"], "sha": data["sha"]})
        return files

    def search_pull_requests(self, repository: str, terms: list[str]) -> list[dict]:
        self._ensure_allowed(repository)
        query = " ".join(terms[:3])
        data = self._get("/search/issues", {"q": f"{query} repo:{repository} is:pr"})
        return [{"number": item["number"], "title": item["title"], "url": item["html_url"], "state": item["state"]} for item in data.get("items", [])[:5]]

    def get_workflow_runs(self, repository: str, branch: str) -> list[dict]:
        self._ensure_allowed(repository)
        data = self._get(f"/repos/{repository}/actions/runs", {"branch": branch, "per_page": 5})
        return [{"name": run["name"], "status": run["status"], "conclusion": run.get("conclusion"), "url": run["html_url"]} for run in data.get("workflow_runs", [])]

    @staticmethod
    def _safe_path(path: str) -> bool:
        lowered = path.lower()
        blocked = (".env", "secret", "credential", "node_modules/", ".next/", "dist/", "build/")
        extensions = (".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".lock")
        return not any(part in lowered for part in blocked) and not lowered.endswith(extensions) and bool(re.match(r"^[\w@./+-]+$", path))

