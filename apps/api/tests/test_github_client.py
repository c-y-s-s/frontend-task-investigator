from app.config import Settings
from app.github_client import GitHubClient, GitHubToolError


def test_safe_path_excludes_dependency_locks_and_evaluation_fixtures():
    assert not GitHubClient._safe_path("package-lock.json")
    assert not GitHubClient._safe_path("apps/web/pnpm-lock.yaml")
    assert not GitHubClient._safe_path("fixtures/issue-128.md")
    assert GitHubClient._safe_path("src/lib/paymentApi.ts")


def test_search_repository_falls_back_to_ranked_branch_tree(monkeypatch):
    client = GitHubClient(Settings(github_allowed_repos="acme/shop", max_files=3))

    def fake_get(path, params=None):
        if path == "/search/code":
            return {"items": []}
        assert path == "/repos/acme/shop/git/trees/feature%2Fpayments"
        assert params == {"recursive": "1"}
        return {"tree": [
            {"type": "blob", "path": "README.md"},
            {"type": "blob", "path": "src/lib/paymentApi.ts"},
            {"type": "blob", "path": "src/components/PaymentForm.tsx"},
            {"type": "blob", "path": "public/checkout.png"},
        ]}

    monkeypatch.setattr(client, "_get", fake_get)
    results = client.search_repository("acme/shop", "feature/payments", ["payment", "retry"])

    assert [item["path"] for item in results] == [
        "src/components/PaymentForm.tsx",
        "src/lib/paymentApi.ts",
        "README.md",
    ]
    assert "/blob/feature%2Fpayments/src/components/PaymentForm.tsx" in results[0]["url"]


def test_search_repository_falls_back_when_code_search_is_rate_limited(monkeypatch):
    client = GitHubClient(Settings(github_allowed_repos="acme/shop", max_files=2))

    def fake_get(path, params=None):
        if path == "/search/code":
            raise GitHubToolError("GitHub rate limit or permission denied")
        return {"tree": [
            {"type": "blob", "path": "src/lib/paymentApi.ts"},
            {"type": "blob", "path": "src/hooks/usePayment.ts"},
        ]}

    monkeypatch.setattr(client, "_get", fake_get)
    results = client.search_repository("acme/shop", "main", ["payment", "retry"])

    assert [item["path"] for item in results] == [
        "src/hooks/usePayment.ts",
        "src/lib/paymentApi.ts",
    ]


def test_search_pull_requests_searches_terms_individually_and_deduplicates(monkeypatch):
    client = GitHubClient(Settings(github_allowed_repos="acme/shop"))
    queries = []

    def fake_get(path, params=None):
        if path == "/search/issues":
            queries.append(params["q"])
            if params["q"].startswith(("payment ", "provider ")):
                return {"items": [{"number": 2, "title": "Normalize payment errors", "html_url": "https://github.com/acme/shop/pull/2", "state": "closed"}]}
            return {"items": []}
        if path == "/repos/acme/shop/pulls/2":
            return {
                "title": "Normalize payment errors",
                "html_url": "https://github.com/acme/shop/pull/2",
                "state": "closed",
                "merged_at": "2026-08-01T10:00:00Z",
                "body": "Defines retryable provider errors",
                "base": {"ref": "main"},
                "head": {"ref": "payment-errors"},
                "changed_files": 1,
            }
        if path == "/repos/acme/shop/pulls/2/files":
            return [{"filename": "src/lib/paymentApi.ts", "status": "modified", "additions": 18, "deletions": 2}]
        raise AssertionError(path)

    monkeypatch.setattr(client, "_get", fake_get)
    results = client.search_pull_requests("acme/shop", ["payment", "retry", "provider"])

    assert queries == [
        "payment repo:acme/shop is:pr",
        "retry repo:acme/shop is:pr",
        "provider repo:acme/shop is:pr",
    ]
    assert [item["number"] for item in results] == [2]
    assert results[0]["merged"] is True
    assert results[0]["files"] == [{
        "path": "src/lib/paymentApi.ts",
        "status": "modified",
        "additions": 18,
        "deletions": 2,
    }]


def test_pull_request_enrichment_caps_changed_files_and_drops_patch(monkeypatch):
    client = GitHubClient(Settings(github_allowed_repos="acme/shop"))

    def fake_get(path, params=None):
        if path == "/search/issues":
            return {"items": [{"number": 7, "title": "Cart state", "html_url": "https://github.com/acme/shop/pull/7", "state": "open"}]}
        if path == "/repos/acme/shop/pulls/7":
            return {"title": "Cart state", "html_url": "https://github.com/acme/shop/pull/7", "state": "open", "merged_at": None, "body": "x" * 5000, "base": {"ref": "main"}, "head": {"ref": "cart"}, "changed_files": 25}
        if path == "/repos/acme/shop/pulls/7/files":
            assert params == {"per_page": 20}
            return [{"filename": f"src/cart/{index}.ts", "status": "added", "additions": 1, "deletions": 0, "patch": "secret diff"} for index in range(25)]
        raise AssertionError(path)

    monkeypatch.setattr(client, "_get", fake_get)
    result = client.search_pull_requests("acme/shop", ["cart"])[0]

    assert result["merged"] is False
    assert len(result["body"]) == 4000
    assert len(result["files"]) == 20
    assert all("patch" not in item for item in result["files"])


def test_pull_request_enrichment_falls_back_to_search_result(monkeypatch):
    client = GitHubClient(Settings(github_allowed_repos="acme/shop"))

    def fake_get(path, params=None):
        if path == "/search/issues":
            return {"items": [{"number": 8, "title": "Cart storage", "html_url": "https://github.com/acme/shop/pull/8", "state": "closed"}]}
        raise GitHubToolError("GitHub rate limit or permission denied")

    monkeypatch.setattr(client, "_get", fake_get)
    result = client.search_pull_requests("acme/shop", ["cart"])[0]

    assert result["number"] == 8
    assert result["details_available"] is False
    assert result["files"] == []
