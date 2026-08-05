import base64
import re
import time
from urllib.parse import quote
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

    def search_repository(self, repository: str, branch: str, terms: list[str]) -> list[dict]:
        self._ensure_allowed(repository)
        results: list[dict] = []
        seen: set[str] = set()
        try:
            for term in terms[:3]:
                data = self._get("/search/code", {"q": f"{term} repo:{repository}"})
                for item in data.get("items", [])[:8]:
                    path = item["path"]
                    if self._safe_path(path) and path not in seen:
                        seen.add(path)
                        results.append({"path": path, "url": item["html_url"]})
        except GitHubToolError:
            # Search has a lower, independent rate limit. The branch tree uses
            # the core API and is a safe deterministic fallback.
            results = []
        if results:
            return results[: self.settings.max_files]

        # GitHub Code Search can return no results for small, private, or newly
        # indexed repositories even though the token can read their contents.
        # Fall back to the branch tree so the investigation does not lose all
        # code context because of search indexing behavior.
        tree = self._get(f"/repos/{repository}/git/trees/{quote(branch, safe='')}", {"recursive": "1"})
        candidates = [
            item["path"]
            for item in tree.get("tree", [])
            if item.get("type") == "blob" and self._safe_path(item["path"]) and self._is_source_file(item["path"])
        ]
        normalized_terms = [term.lower() for term in terms]
        candidates.sort(
            key=lambda path: (
                -sum(term in path.lower() for term in normalized_terms),
                self._source_priority(path),
                path.lower(),
            )
        )
        encoded_branch = quote(branch, safe="")
        return [
            {
                "path": path,
                "url": f"https://github.com/{repository}/blob/{encoded_branch}/{quote(path, safe='/')}",
            }
            for path in candidates[: self.settings.max_files]
        ]

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
        matches: list[dict] = []
        seen: set[int] = set()
        for term in terms[:3]:
            data = self._get("/search/issues", {"q": f"{term} repo:{repository} is:pr"})
            for item in data.get("items", []):
                if item["number"] in seen:
                    continue
                seen.add(item["number"])
                matches.append({
                    "number": item["number"],
                    "title": item["title"],
                    "url": item["html_url"],
                    "state": item["state"],
                })
                if len(matches) == 3:
                    return [self._enrich_pull_request(repository, match) for match in matches]
        return [self._enrich_pull_request(repository, match) for match in matches]

    def _enrich_pull_request(self, repository: str, match: dict) -> dict:
        """Add bounded PR evidence while preserving search results on API failure."""
        number = match["number"]
        try:
            detail = self._get(f"/repos/{repository}/pulls/{number}")
            files = self._get(
                f"/repos/{repository}/pulls/{number}/files",
                {"per_page": 20},
            )
        except (GitHubToolError, httpx.HTTPError, KeyError, TypeError):
            return {**match, "details_available": False, "files": []}

        changed_files = []
        for item in files[:20] if isinstance(files, list) else []:
            changed_files.append({
                "path": item.get("filename", ""),
                "status": item.get("status", "modified"),
                "additions": item.get("additions", 0),
                "deletions": item.get("deletions", 0),
            })

        return {
            **match,
            "title": detail.get("title", match["title"]),
            "url": detail.get("html_url", match["url"]),
            "state": detail.get("state", match["state"]),
            "merged": bool(detail.get("merged_at")),
            "merged_at": detail.get("merged_at"),
            "body": (detail.get("body") or "")[:4000],
            "base_branch": (detail.get("base") or {}).get("ref"),
            "head_branch": (detail.get("head") or {}).get("ref"),
            "changed_files": detail.get("changed_files", len(changed_files)),
            "files": changed_files,
            "details_available": True,
        }

    def get_workflow_runs(self, repository: str, branch: str) -> list[dict]:
        self._ensure_allowed(repository)
        data = self._get(f"/repos/{repository}/actions/runs", {"branch": branch, "per_page": 5})
        return [{"name": run["name"], "status": run["status"], "conclusion": run.get("conclusion"), "url": run["html_url"]} for run in data.get("workflow_runs", [])]

    @staticmethod
    def _safe_path(path: str) -> bool:
        lowered = path.lower()
        basename = lowered.rsplit("/", 1)[-1]
        blocked = (".env", "secret", "credential", "node_modules/", ".next/", "dist/", "build/")
        extensions = (".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".lock")
        lockfiles = {"package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"}
        excluded_paths = ("fixtures/",)
        return (
            not any(part in lowered for part in blocked)
            and not any(lowered.startswith(prefix) for prefix in excluded_paths)
            and basename not in lockfiles
            and not lowered.endswith(extensions)
            and bool(re.match(r"^[\w@./+-]+$", path))
        )

    @staticmethod
    def _is_source_file(path: str) -> bool:
        return path.lower().endswith((
            ".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".json",
            ".md", ".py", ".html", ".yml", ".yaml",
        ))

    @staticmethod
    def _source_priority(path: str) -> int:
        lowered = path.lower()
        if lowered.endswith((".ts", ".tsx", ".js", ".jsx", ".py")):
            return 0
        if lowered.endswith((".css", ".scss", ".html")):
            return 1
        return 2
