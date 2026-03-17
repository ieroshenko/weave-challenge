from __future__ import annotations

import argparse
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

from shared import (
    DEFAULT_REPO,
    DEFAULT_WINDOW_DAYS,
    GitHubClient,
    compute_window,
    is_bot_login,
    parse_github_datetime,
    parse_issue_references,
    require_github_token,
    to_github_datetime,
    utc_now,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch engineer impact data from GitHub.")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="GitHub repo in owner/name format.")
    parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument(
        "--cache-dir",
        default="data/cache/github",
        help="Directory used for per-endpoint response caching.",
    )
    parser.add_argument(
        "--output",
        default="data/cache/github/engineer_impact_raw.json",
        help="Raw snapshot written for the scoring stage.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Bypass cached GitHub responses and refetch everything.",
    )
    return parser.parse_args()


def split_repo(repo: str) -> tuple[str, str]:
    owner, name = repo.split("/", 1)
    return owner, name


def slim_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
    if not user:
        return None
    return {
        "login": user.get("login"),
        "avatar_url": user.get("avatar_url"),
        "profile_url": user.get("html_url"),
        "type": user.get("type"),
    }


def slim_review(review: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": review.get("id"),
        "state": review.get("state"),
        "submitted_at": review.get("submitted_at"),
        "user": slim_user(review.get("user")),
    }


def slim_comment(comment: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": comment.get("id"),
        "pull_request_review_id": comment.get("pull_request_review_id"),
        "created_at": comment.get("created_at"),
        "user": slim_user(comment.get("user")),
    }


def slim_issue(issue: dict[str, Any] | None) -> dict[str, Any] | None:
    if not issue:
        return None
    return {
        "number": issue.get("number"),
        "title": issue.get("title"),
        "created_at": issue.get("created_at"),
        "closed_at": issue.get("closed_at"),
        "html_url": issue.get("html_url"),
        "is_pull_request": "pull_request" in issue,
    }


def fetch_paginated_items(
    client: GitHubClient,
    path: str,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for page in client.paginate(path):
        items.extend(page)
    return items


def fetch_pull_request_detail(
    client: GitHubClient,
    owner: str,
    repo: str,
    pr_number: int,
) -> dict[str, Any]:
    pr = client.get_json(f"/repos/{owner}/{repo}/pulls/{pr_number}")
    return {
        "number": pr.get("number"),
        "title": pr.get("title"),
        "body": pr.get("body") or "",
        "created_at": pr.get("created_at"),
        "merged_at": pr.get("merged_at"),
        "html_url": pr.get("html_url"),
        "additions": pr.get("additions") or 0,
        "deletions": pr.get("deletions") or 0,
        "author": slim_user(pr.get("user")),
        "referenced_issue_numbers": parse_issue_references(pr.get("body") or ""),
    }


def fetch_merged_pull_requests(
    client: GitHubClient,
    owner: str,
    repo: str,
    window_start: Any,
    window_end: Any,
) -> list[dict[str, Any]]:
    def merged_range_query(range_start: Any, range_end: Any) -> str:
        return (
            f"repo:{owner}/{repo} is:pr is:merged "
            f"merged:{to_github_datetime(range_start)}..{to_github_datetime(range_end)}"
        )

    def search_range(range_start: Any, range_end: Any, depth: int = 0) -> list[int]:
        query = merged_range_query(range_start, range_end)
        payload = client.get_json(
            "/search/issues",
            params={
                "q": query,
                "sort": "updated",
                "order": "desc",
                "page": 1,
                "per_page": 100,
            },
        )
        total_count = int(payload.get("total_count", 0))
        print(
            f"Searching merged PRs for {to_github_datetime(range_start)}..{to_github_datetime(range_end)} "
            f"(matches: {total_count})"
        )

        if total_count > 1000:
            span = range_end - range_start
            if span <= timedelta(days=1):
                raise RuntimeError(
                    "A single-day search range still exceeded GitHub's 1000-result limit. "
                    "Use a shorter analysis window."
                )
            midpoint = range_start + (span / 2)
            left_numbers = search_range(range_start, midpoint, depth + 1)
            right_numbers = search_range(midpoint + timedelta(seconds=1), range_end, depth + 1)
            return left_numbers + right_numbers

        numbers = [item["number"] for item in payload.get("items", [])]
        total_pages = max((min(total_count, 1000) - 1) // 100 + 1, 1)
        for page in range(2, total_pages + 1):
            page_payload = client.get_json(
                "/search/issues",
                params={
                    "q": query,
                    "sort": "updated",
                    "order": "desc",
                    "page": page,
                    "per_page": 100,
                },
            )
            numbers.extend(item["number"] for item in page_payload.get("items", []))
        return numbers

    candidate_numbers = sorted(set(search_range(window_start, window_end)))
    print(f"Found {len(candidate_numbers)} merged PR candidates in the window")

    pull_requests: list[dict[str, Any]] = []
    for index, pr_number in enumerate(sorted(candidate_numbers), start=1):
        pull_request = fetch_pull_request_detail(client, owner, repo, pr_number)
        merged_at = parse_github_datetime(pull_request.get("merged_at"))
        if merged_at is None or merged_at < window_start or merged_at > window_end:
            continue
        pull_requests.append(pull_request)
        if index % 25 == 0:
            print(f"Loaded details for {index}/{len(candidate_numbers)} PRs")

    pull_requests.sort(key=lambda pr: (pr["merged_at"], pr["number"]))
    return pull_requests


def fetch_reviews_and_comments(
    client: GitHubClient,
    owner: str,
    repo: str,
    pr_number: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    reviews = fetch_paginated_items(client, f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews")
    review_comments = fetch_paginated_items(client, f"/repos/{owner}/{repo}/pulls/{pr_number}/comments")
    issue_comments = fetch_paginated_items(client, f"/repos/{owner}/{repo}/issues/{pr_number}/comments")
    return (
        [slim_review(review) for review in reviews or []],
        [slim_comment(comment) for comment in review_comments or []],
        [slim_comment(comment) for comment in issue_comments or []],
    )


def fetch_issue_details(
    client: GitHubClient,
    owner: str,
    repo: str,
    issue_number: int,
) -> dict[str, Any] | None:
    issue = client.get_json(
        f"/repos/{owner}/{repo}/issues/{issue_number}",
        allow_404=True,
    )
    return slim_issue(issue)


def fetch_user_profiles(
    client: GitHubClient,
    logins: set[str],
) -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for login in sorted(logins):
        profile = client.get_json(f"/users/{quote(login)}", allow_404=True)
        if not profile:
            profiles[login] = {
                "login": login,
                "display_name": login,
                "avatar_url": None,
                "profile_url": f"https://github.com/{login}",
            }
            continue
        profiles[login] = {
            "login": profile.get("login") or login,
            "display_name": profile.get("name") or profile.get("login") or login,
            "avatar_url": profile.get("avatar_url"),
            "profile_url": profile.get("html_url") or f"https://github.com/{login}",
        }
    return profiles


def main() -> None:
    args = parse_args()
    token = require_github_token()
    owner, repo = split_repo(args.repo)
    now = utc_now()
    window_start, window_end = compute_window(args.window_days, now)
    client = GitHubClient(token=token, cache_dir=Path(args.cache_dir), refresh=args.refresh)

    pull_requests = fetch_merged_pull_requests(client, owner, repo, window_start, window_end)
    issue_cache: dict[int, dict[str, Any] | None] = {}
    human_logins: set[str] = set()
    enriched_pull_requests: list[dict[str, Any]] = []

    print(f"Enriching {len(pull_requests)} merged PRs with reviews, comments, and issues")
    for index, pr in enumerate(pull_requests, start=1):
        reviews, review_comments, issue_comments = fetch_reviews_and_comments(client, owner, repo, pr["number"])

        issue_details: list[dict[str, Any]] = []
        for issue_number in pr["referenced_issue_numbers"]:
            if issue_number not in issue_cache:
                issue_cache[issue_number] = fetch_issue_details(client, owner, repo, issue_number)
            issue = issue_cache[issue_number]
            if issue:
                issue_details.append(issue)

        author = pr.get("author") or {}
        author_login = author.get("login")
        if author_login and not is_bot_login(author_login):
            human_logins.add(author_login)

        for review in reviews:
            reviewer = review.get("user") or {}
            reviewer_login = reviewer.get("login")
            if reviewer_login and not is_bot_login(reviewer_login):
                human_logins.add(reviewer_login)

        enriched_pull_requests.append(
            {
                **pr,
                "reviews": reviews,
                "review_comments": review_comments,
                "issue_comments": issue_comments,
                "referenced_issues": issue_details,
            }
        )

        if index % 25 == 0 or index == len(pull_requests):
            print(f"Enriched {index}/{len(pull_requests)} PRs")

    profiles = fetch_user_profiles(client, human_logins)
    output_path = Path(args.output)
    payload = {
        "generated_at": to_github_datetime(now),
        "repo": args.repo,
        "window_days": args.window_days,
        "window_start": to_github_datetime(window_start),
        "window_end": to_github_datetime(window_end),
        "pull_requests": enriched_pull_requests,
        "user_profiles": profiles,
    }
    write_json(output_path, payload)

    print(f"Fetched {len(enriched_pull_requests)} merged PRs into {output_path}")


if __name__ == "__main__":
    main()
