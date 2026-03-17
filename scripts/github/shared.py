from __future__ import annotations

import hashlib
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections.abc import Iterator
from typing import Any
from urllib import error, parse, request

GITHUB_API_BASE = "https://api.github.com"
DEFAULT_REPO = "PostHog/posthog"
DEFAULT_WINDOW_DAYS = 90
REQUEST_TIMEOUT_SECONDS = 30
DEFAULT_RETRY_ATTEMPTS = 5
KNOWN_BOT_LOGINS = {
    "dependabot[bot]",
    "github-actions[bot]",
    "posthog-bot",
    "renovate[bot]",
}
ISSUE_REFERENCE_RE = re.compile(
    r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+"
    r"(?:(?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?)#(\d+)"
)


def load_dotenv() -> Path | None:
    for candidate in [Path.cwd(), *Path.cwd().parents]:
        dotenv_path = candidate / ".env"
        if not dotenv_path.exists():
            continue
        for line in dotenv_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if stripped.startswith("export "):
                stripped = stripped[len("export ") :]
            if "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip()
            if not key or key in os.environ:
                continue
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            os.environ[key] = value
        return dotenv_path
    return None


def require_github_token() -> str:
    load_dotenv()
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token:
        raise SystemExit("GITHUB_TOKEN is required to fetch GitHub data. Set it in the environment or a local .env file.")
    return token


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def compute_window(window_days: int, end: datetime | None = None) -> tuple[datetime, datetime]:
    window_end = end or utc_now()
    return window_end - timedelta(days=window_days), window_end


def parse_github_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def to_github_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def week_key(value: str | datetime | None) -> str | None:
    if value is None:
        return None
    timestamp = parse_github_datetime(value) if isinstance(value, str) else value
    if timestamp is None:
        return None
    iso = timestamp.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def is_bot_login(login: str | None) -> bool:
    if not login:
        return False
    lowered = login.lower()
    return lowered.endswith("[bot]") or lowered in KNOWN_BOT_LOGINS


def parse_issue_references(body: str | None) -> list[int]:
    if not body:
        return []
    seen: set[int] = set()
    issue_numbers: list[int] = []
    for match in ISSUE_REFERENCE_RE.finditer(body):
        issue_number = int(match.group(1))
        if issue_number in seen:
            continue
        seen.add(issue_number)
        issue_numbers.append(issue_number)
    return issue_numbers


def round_number(value: float, digits: int = 1) -> float:
    return round(value, digits)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


class GitHubClient:
    def __init__(self, token: str, cache_dir: Path, refresh: bool = False) -> None:
        self.token = token
        self.cache_dir = cache_dir
        self.refresh = refresh
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        allow_404: bool = False,
    ) -> Any:
        url = self._build_url(path, params)
        cache_path = self._cache_path(url)
        if cache_path.exists() and not self.refresh:
            return read_json(cache_path)

        response_payload = self._request_with_retries(url, allow_404=allow_404)
        write_json(cache_path, response_payload)
        return response_payload

    def paginate(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        per_page: int = 100,
    ) -> Iterator[list[dict[str, Any]]]:
        page = 1
        while True:
            page_params = dict(params or {})
            page_params.update({"page": page, "per_page": per_page})
            payload = self.get_json(path, page_params)
            if not payload:
                break
            if not isinstance(payload, list):
                raise RuntimeError(f"Expected a list payload for {path}, received {type(payload)!r}")
            yield payload
            if len(payload) < per_page:
                break
            page += 1

    def _request_with_retries(self, url: str, *, allow_404: bool) -> Any:
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "athens-engineer-impact-dashboard",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        for attempt in range(1, DEFAULT_RETRY_ATTEMPTS + 1):
            req = request.Request(url, headers=headers)
            try:
                with request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                    return json.loads(response.read().decode("utf-8"))
            except error.HTTPError as exc:
                if allow_404 and exc.code == 404:
                    return None
                if exc.code in {403, 429} or 500 <= exc.code < 600:
                    delay = self._retry_delay_seconds(exc, attempt)
                    if attempt == DEFAULT_RETRY_ATTEMPTS:
                        break
                    time.sleep(delay)
                    continue
                detail = exc.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"GitHub request failed for {url} with status {exc.code}: {detail}") from exc
            except error.URLError as exc:
                if attempt == DEFAULT_RETRY_ATTEMPTS:
                    raise RuntimeError(f"GitHub request failed for {url}: {exc}") from exc
                time.sleep(min(2**attempt, 30))
        raise RuntimeError(f"GitHub request failed after retries: {url}")

    def _retry_delay_seconds(self, exc: error.HTTPError, attempt: int) -> float:
        retry_after = exc.headers.get("Retry-After")
        if retry_after:
            try:
                return max(float(retry_after), 1.0)
            except ValueError:
                pass

        if exc.headers.get("X-RateLimit-Remaining") == "0":
            reset_at = exc.headers.get("X-RateLimit-Reset")
            if reset_at:
                try:
                    wait_seconds = int(reset_at) - int(time.time())
                    return max(wait_seconds + 1, 1)
                except ValueError:
                    pass

        return min(2**attempt, 30)

    def _build_url(self, path: str, params: dict[str, Any] | None) -> str:
        query_string = parse.urlencode(sorted((params or {}).items()))
        if query_string:
            return f"{GITHUB_API_BASE}{path}?{query_string}"
        return f"{GITHUB_API_BASE}{path}"

    def _cache_path(self, url: str) -> Path:
        parsed_url = parse.urlparse(url)
        path_bits = parsed_url.path.strip("/").split("/")
        safe_stem = "_".join(bit.replace("[", "").replace("]", "") for bit in path_bits[-4:])
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
        filename = f"{safe_stem}_{digest}.json" if safe_stem else f"{digest}.json"
        return self.cache_dir / filename
