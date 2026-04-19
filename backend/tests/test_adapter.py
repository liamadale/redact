import pytest
import respx
from httpx import Response

from app.adapters.github import GitHubAdapter


@pytest.fixture
def mock_api():
    with respx.mock(base_url="https://api.github.com") as api:
        yield api


@pytest.mark.asyncio
async def test_list_repos_filters_private(mock_api):
    mock_api.get("/orgs/test-org/repos").mock(
        return_value=Response(
            200,
            json=[
                {
                    "name": "public-repo",
                    "full_name": "test-org/public-repo",
                    "clone_url": "https://github.com/test-org/public-repo.git",
                    "default_branch": "main",
                    "size": 100,
                    "private": False,
                    "pushed_at": "2026-01-01T00:00:00Z",
                },
                {
                    "name": "private-repo",
                    "full_name": "test-org/private-repo",
                    "clone_url": "https://github.com/test-org/private-repo.git",
                    "default_branch": "main",
                    "size": 50,
                    "private": True,
                    "pushed_at": "2026-01-01T00:00:00Z",
                },
            ],
        )
    )
    # Second page empty to stop pagination
    mock_api.get("/orgs/test-org/repos").mock(
        side_effect=[
            Response(
                200,
                json=[
                    {
                        "name": "public-repo",
                        "full_name": "test-org/public-repo",
                        "clone_url": "https://github.com/test-org/public-repo.git",
                        "default_branch": "main",
                        "size": 100,
                        "private": False,
                        "pushed_at": "2026-01-01T00:00:00Z",
                    },
                    {
                        "name": "private-repo",
                        "full_name": "test-org/private-repo",
                        "clone_url": "https://github.com/test-org/private-repo.git",
                        "default_branch": "main",
                        "size": 50,
                        "private": True,
                        "pushed_at": "2026-01-01T00:00:00Z",
                    },
                ],
            ),
            Response(200, json=[]),
        ]
    )

    adapter = GitHubAdapter(token=None)
    repos = await adapter.list_repos("test-org")
    await adapter.close()

    assert len(repos) == 1
    assert repos[0].full_name == "test-org/public-repo"
    assert repos[0].is_private is False


@pytest.mark.asyncio
async def test_list_repos_falls_back_to_user(mock_api):
    mock_api.get("/orgs/someuser/repos").mock(
        side_effect=[
            Response(404),
            Response(404),
        ]
    )
    mock_api.get("/users/someuser/repos").mock(
        side_effect=[
            Response(
                200,
                json=[
                    {
                        "name": "repo1",
                        "full_name": "someuser/repo1",
                        "clone_url": "https://github.com/someuser/repo1.git",
                        "default_branch": "main",
                        "size": 200,
                        "private": False,
                        "pushed_at": "2026-02-01T00:00:00Z",
                    },
                ],
            ),
            Response(200, json=[]),
        ]
    )

    adapter = GitHubAdapter(token=None)
    repos = await adapter.list_repos("someuser")
    await adapter.close()

    assert len(repos) == 1
    assert repos[0].full_name == "someuser/repo1"


@pytest.mark.asyncio
async def test_search_code_returns_hits(mock_api):
    mock_api.get("/search/code").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "path": "config.py",
                        "html_url": "https://github.com/org/repo/blob/main/config.py",
                        "repository": {
                            "name": "repo",
                            "full_name": "org/repo",
                            "clone_url": "https://github.com/org/repo.git",
                            "default_branch": "main",
                            "size": 100,
                            "private": False,
                            "pushed_at": "2026-01-01T00:00:00Z",
                        },
                        "text_matches": [{"fragment": "AKIAIOSFODNN7EXAMPLE"}],
                    }
                ]
            },
        )
    )

    adapter = GitHubAdapter(token="fake-token")
    hits = await adapter.search_code("org", ["AKIA"])
    await adapter.close()

    assert len(hits) == 1
    assert hits[0].file_path == "config.py"
    assert hits[0].matched_pattern == "AKIA"


@pytest.mark.asyncio
async def test_list_repos_empty(mock_api):
    mock_api.get("/orgs/empty-org/repos").mock(return_value=Response(200, json=[]))

    adapter = GitHubAdapter(token=None)
    repos = await adapter.list_repos("empty-org")
    await adapter.close()

    assert repos == []


@pytest.mark.asyncio
async def test_search_code_handles_missing_clone_url(mock_api):
    """Regression: GitHub Search API doesn't include clone_url in repository object."""
    mock_api.get("/search/code").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "path": "config.py",
                        "html_url": "https://github.com/org/repo/blob/main/config.py",
                        "repository": {
                            "name": "repo",
                            "full_name": "org/repo",
                            # No clone_url field — this is what the real API returns
                            "default_branch": "main",
                            "size": 100,
                            "private": False,
                            "pushed_at": "2026-01-01T00:00:00Z",
                        },
                        "text_matches": [{"fragment": "AKIAIOSFODNN7EXAMPLE"}],
                    }
                ]
            },
        )
    )

    adapter = GitHubAdapter(token="fake-token")
    hits = await adapter.search_code("org", ["AKIA"])
    await adapter.close()

    assert len(hits) == 1
    assert hits[0].repo.clone_url == "https://github.com/org/repo.git"


@pytest.mark.asyncio
async def test_search_code_handles_401_unauthorized(mock_api):
    """Regression: Search API returns 401 when no token is provided."""
    mock_api.get("/search/code").mock(
        return_value=Response(401, json={"message": "Requires authentication"})
    )

    adapter = GitHubAdapter(token=None)
    hits = await adapter.search_code("org", ["AKIA"])
    await adapter.close()

    # Should not crash — returns empty results
    assert hits == []
