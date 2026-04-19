from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Repo:
    name: str
    full_name: str
    clone_url: str
    default_branch: str
    size_kb: int
    is_private: bool
    last_pushed_at: str


@dataclass
class SearchHit:
    repo: Repo
    file_path: str
    matched_pattern: str
    text_fragment: str
    html_url: str


class PlatformAdapter(ABC):
    @abstractmethod
    async def list_repos(self, org: str) -> list[Repo]: ...

    @abstractmethod
    async def search_code(self, org: str, patterns: list[str]) -> list[SearchHit]: ...
