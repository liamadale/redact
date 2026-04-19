import asyncio
import logging

import httpx

from app.adapters.base import PlatformAdapter, Repo, SearchHit

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

# Patterns for quick scan (GitHub Search API)
SEARCH_PATTERNS = [
    "AKIA",
    "sk_live_",
    "sk_test_",
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN EC PRIVATE KEY",
    "ghp_",
    "gho_",
    "glpat-",
    "xoxb-",
    "xoxp-",
]


class GitHubAdapter(PlatformAdapter):
    def __init__(self, token: str | None = None):
        headers = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(
            base_url=GITHUB_API, headers=headers, timeout=30
        )

    async def close(self):
        await self._client.aclose()

    async def list_repos(self, org: str) -> list[Repo]:
        repos: list[Repo] = []
        page = 1
        while True:
            # Try as org first, fall back to user
            resp = await self._client.get(
                f"/orgs/{org}/repos", params={"per_page": 100, "page": page}
            )
            if resp.status_code == 404:
                resp = await self._client.get(
                    f"/users/{org}/repos", params={"per_page": 100, "page": page}
                )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                break
            for r in data:
                if r.get("private"):
                    continue
                repos.append(
                    Repo(
                        name=r["name"],
                        full_name=r["full_name"],
                        clone_url=r["clone_url"],
                        default_branch=r.get("default_branch", "main"),
                        size_kb=r.get("size", 0),
                        is_private=r["private"],
                        last_pushed_at=r.get("pushed_at", ""),
                    )
                )
            page += 1
        return repos

    async def search_code(self, org: str, patterns: list[str]) -> list[SearchHit]:
        hits: list[SearchHit] = []
        seen = set()

        for pattern in patterns:
            query = f"{pattern} org:{org}"
            try:
                resp = await self._client.get(
                    "/search/code",
                    params={"q": query, "per_page": 100},
                    headers={"Accept": "application/vnd.github.text-match+json"},
                )
                if resp.status_code == 403:
                    logger.warning("Rate limited on search, sleeping 60s")
                    await asyncio.sleep(60)
                    continue
                if resp.status_code == 422:
                    logger.warning("Search query rejected: %s", query)
                    continue
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                logger.error("Search failed for pattern %s: %s", pattern, e)
                continue

            for item in resp.json().get("items", []):
                repo_data = item["repository"]
                dedup_key = f"{repo_data['full_name']}:{item['path']}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                # Redact the matched fragment (show first 4 chars + mask)
                fragment = ""
                for tm in item.get("text_matches", []):
                    fragment = tm.get("fragment", "")
                    break

                repo = Repo(
                    name=repo_data["name"],
                    full_name=repo_data["full_name"],
                    clone_url=repo_data.get(
                        "clone_url",
                        f"https://github.com/{repo_data['full_name']}.git",
                    ),
                    default_branch=repo_data.get("default_branch", "main"),
                    size_kb=repo_data.get("size", 0),
                    is_private=repo_data.get("private", False),
                    last_pushed_at=repo_data.get("pushed_at", ""),
                )

                hits.append(
                    SearchHit(
                        repo=repo,
                        file_path=item["path"],
                        matched_pattern=pattern,
                        text_fragment=fragment,
                        html_url=item["html_url"],
                    )
                )

            # Respect search rate limit (30 req/min authenticated)
            await asyncio.sleep(2)

        return hits
