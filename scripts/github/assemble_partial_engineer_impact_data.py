from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from shared import DEFAULT_REPO, DEFAULT_WINDOW_DAYS, parse_issue_references, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Assemble a partial engineer impact snapshot from cached GitHub responses.")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument("--cache-dir", default="data/cache/github")
    parser.add_argument("--output", default="data/cache/github/engineer_impact_raw.json")
    return parser.parse_args()


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


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_cache_index(cache_dir: Path) -> dict[str, dict[int, Path]]:
    detail_pattern = re.compile(r"^PostHog_posthog_pulls_(\d+)_")
    reviews_pattern = re.compile(r"^posthog_pulls_(\d+)_reviews_")
    review_comments_pattern = re.compile(r"^posthog_pulls_(\d+)_comments_")
    issue_comments_pattern = re.compile(r"^posthog_issues_(\d+)_comments_")
    issue_pattern = re.compile(r"^PostHog_posthog_issues_(\d+)_")

    index = {
        "detail": {},
        "reviews": {},
        "review_comments": {},
        "issue_comments": {},
        "issues": {},
    }

    for path in cache_dir.glob("*.json"):
        name = path.name
        for kind, pattern in (
            ("detail", detail_pattern),
            ("reviews", reviews_pattern),
            ("review_comments", review_comments_pattern),
            ("issue_comments", issue_comments_pattern),
            ("issues", issue_pattern),
        ):
            match = pattern.match(name)
            if match:
                index[kind][int(match.group(1))] = path
                break
    return index


def candidate_numbers(cache_dir: Path) -> set[int]:
    numbers: set[int] = set()
    for path in cache_dir.glob("search_issues_*.json"):
        payload = load_json(path)
        for item in payload.get("items", []):
            numbers.add(item["number"])
    return numbers


def main() -> None:
    args = parse_args()
    cache_dir = Path(args.cache_dir)
    index = build_cache_index(cache_dir)
    candidates = candidate_numbers(cache_dir)
    fully_cached = sorted(
        candidates
        & set(index["detail"])
        & set(index["reviews"])
        & set(index["review_comments"])
        & set(index["issue_comments"])
    )

    pull_requests: list[dict[str, Any]] = []
    profiles: dict[str, dict[str, Any]] = {}
    cached_issue_hits = 0

    for pr_number in fully_cached:
        detail = load_json(index["detail"][pr_number])
        raw_reviews = load_json(index["reviews"][pr_number])
        raw_review_comments = load_json(index["review_comments"][pr_number])
        raw_issue_comments = load_json(index["issue_comments"][pr_number])

        body = detail.get("body") or ""
        referenced_issue_numbers = parse_issue_references(body)
        referenced_issues = []
        for issue_number in referenced_issue_numbers:
            issue_path = index["issues"].get(issue_number)
            if not issue_path:
                continue
            issue = slim_issue(load_json(issue_path))
            if issue:
                cached_issue_hits += 1
                referenced_issues.append(issue)

        author = slim_user(detail.get("user"))
        if author and author.get("login"):
            profiles[author["login"]] = {
                "login": author["login"],
                "display_name": author["login"],
                "avatar_url": author.get("avatar_url"),
                "profile_url": author.get("profile_url"),
            }

        for review in raw_reviews:
            user = slim_user(review.get("user"))
            if user and user.get("login"):
                profiles[user["login"]] = {
                    "login": user["login"],
                    "display_name": user["login"],
                    "avatar_url": user.get("avatar_url"),
                    "profile_url": user.get("profile_url"),
                }

        pull_requests.append(
            {
                "number": detail.get("number"),
                "title": detail.get("title"),
                "body": body,
                "created_at": detail.get("created_at"),
                "merged_at": detail.get("merged_at"),
                "html_url": detail.get("html_url"),
                "additions": detail.get("additions") or 0,
                "deletions": detail.get("deletions") or 0,
                "author": author,
                "referenced_issue_numbers": referenced_issue_numbers,
                "reviews": [slim_review(review) for review in raw_reviews],
                "review_comments": [slim_comment(comment) for comment in raw_review_comments],
                "issue_comments": [slim_comment(comment) for comment in raw_issue_comments],
                "referenced_issues": referenced_issues,
            }
        )

    pull_requests.sort(key=lambda pr: (pr["merged_at"], pr["number"]))
    payload = {
        "generated_at": None,
        "repo": args.repo,
        "window_days": args.window_days,
        "window_start": None,
        "window_end": None,
        "partial": True,
        "coverage": {
            "candidate_prs": len(candidates),
            "included_prs": len(fully_cached),
            "included_ratio": round(len(fully_cached) / max(len(candidates), 1), 4),
            "cached_issue_hits": cached_issue_hits,
        },
        "notes": [
            "Built only from already cached GitHub responses.",
            "PRs missing any of detail, reviews, review comments, or issue comments were excluded.",
            "User profile display names fall back to login because profile enrichment may be incomplete.",
        ],
        "pull_requests": pull_requests,
        "user_profiles": profiles,
    }
    write_json(Path(args.output), payload)
    print(
        f"Wrote partial raw snapshot with {len(fully_cached)} PRs "
        f"from {len(candidates)} cached candidates to {args.output}"
    )


if __name__ == "__main__":
    main()
