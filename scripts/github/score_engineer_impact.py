from __future__ import annotations

import argparse
import math
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

from shared import (
    DEFAULT_REPO,
    DEFAULT_WINDOW_DAYS,
    is_bot_login,
    parse_github_datetime,
    read_json,
    round_number,
    to_github_datetime,
    utc_now,
    week_key,
    write_json,
)

WEIGHTS = {
    "shipping": 0.30,
    "enablement": 0.30,
    "complexity": 0.25,
    "consistency": 0.15,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score engineer impact from a raw GitHub snapshot.")
    parser.add_argument(
        "--input",
        default="data/cache/github/engineer_impact_raw.json",
        help="Raw snapshot produced by fetch_engineer_impact_data.py",
    )
    parser.add_argument("--output", default="data/engineers.json")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    return parser.parse_args()


def empty_identity(login: str) -> dict[str, Any]:
    return {
        "login": login,
        "display_name": login,
        "avatar_url": None,
        "profile_url": f"https://github.com/{login}",
    }


def make_contributor(login: str, identity: dict[str, Any]) -> dict[str, Any]:
    return {
        "identity": {
            "login": identity.get("login") or login,
            "display_name": identity.get("display_name") or login,
            "avatar_url": identity.get("avatar_url"),
            "profile_url": identity.get("profile_url") or f"https://github.com/{login}",
        },
        "stats": {
            "merged_prs": 0,
            "issues_closed": 0,
            "total_additions": 0,
            "total_deletions": 0,
            "code_reduction_bonus": 0.0,
            "reviews_given": 0,
            "avg_comments_per_review": 0.0,
            "median_response_hours": None,
            "avg_discussion_comments_per_pr": 0.0,
            "total_issue_age_days": 0.0,
            "active_weeks": 0,
        },
        "_review_comment_counts": [],
        "_response_hours": [],
        "_discussion_comment_total": 0,
        "_active_weeks": set(),
        "_closed_issues": {},
    }


def ensure_contributor(
    contributors: dict[str, dict[str, Any]],
    profiles: dict[str, dict[str, Any]],
    login: str,
    fallback_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if login not in contributors:
        profile = profiles.get(login) or empty_identity(login)
        if fallback_user:
            profile = {
                "login": login,
                "display_name": profile.get("display_name") or login,
                "avatar_url": profile.get("avatar_url") or fallback_user.get("avatar_url"),
                "profile_url": profile.get("profile_url") or fallback_user.get("profile_url"),
            }
        contributors[login] = make_contributor(login, profile)
    return contributors[login]


def hours_between(start: str, end: str) -> float:
    start_dt = parse_github_datetime(start)
    end_dt = parse_github_datetime(end)
    if start_dt is None or end_dt is None:
        return 0.0
    return max((end_dt - start_dt).total_seconds() / 3600, 0.0)


def compute_issue_age_days(created_at: str | None, closed_at: str | None) -> float:
    created_dt = parse_github_datetime(created_at)
    closed_dt = parse_github_datetime(closed_at)
    if created_dt is None or closed_dt is None:
        return 0.0
    return max((closed_dt - created_dt).total_seconds() / 86400, 0.0)


def normalize_0_100(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    minimum = min(values.values())
    maximum = max(values.values())
    if math.isclose(minimum, maximum):
        if math.isclose(maximum, 0.0):
            return {login: 0.0 for login in values}
        return {login: 100.0 for login in values}
    return {
        login: ((value - minimum) / (maximum - minimum)) * 100
        for login, value in values.items()
    }


def normalize_0_1(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    minimum = min(values.values())
    maximum = max(values.values())
    if math.isclose(minimum, maximum):
        return {login: 0.0 for login in values}
    return {
        login: (value - minimum) / (maximum - minimum)
        for login, value in values.items()
    }


def generate_why_it_matters(contributor: dict[str, Any]) -> list[str]:
    stats = contributor["stats"]
    scores = contributor["scores"]
    complexity_bullet = (
        f"Handled {stats['avg_discussion_comments_per_pr']:.1f} discussion comments per merged PR."
        if stats["issues_closed"] == 0
        else (
            f"Handled {stats['avg_discussion_comments_per_pr']:.1f} discussion comments per merged PR "
            f"and closed issues averaging "
            f"{(stats['total_issue_age_days'] / max(stats['issues_closed'], 1)):.0f} days old."
        )
    )
    candidate_bullets = {
        "shipping": (
            f"Merged {stats['merged_prs']} PRs, closed {stats['issues_closed']} issues, "
            f"and earned a {stats['code_reduction_bonus']:.1f} cleanup bonus."
        ),
        "enablement": (
            f"Submitted {stats['reviews_given']} reviews with {stats['avg_comments_per_review']:.1f} "
            f"comments per review and a median response time of "
            f"{(stats['median_response_hours'] or 0.0):.1f} hours."
        ),
        "complexity": complexity_bullet,
        "consistency": f"Stayed active in {stats['active_weeks']} of 13 calendar weeks.",
    }

    ordered_dimensions = sorted(
        WEIGHTS,
        key=lambda dimension: scores[dimension]["contribution"],
        reverse=True,
    )

    bullets: list[str] = []
    for dimension in ordered_dimensions:
        stats_gate = {
            "shipping": stats["merged_prs"] > 0,
            "enablement": stats["reviews_given"] > 0,
            "complexity": stats["merged_prs"] > 0,
            "consistency": stats["active_weeks"] > 0,
        }[dimension]
        if stats_gate:
            bullets.append(candidate_bullets[dimension])
        if len(bullets) == 3:
            break

    if len(bullets) < 2 and stats["active_weeks"] > 0 and candidate_bullets["consistency"] not in bullets:
        bullets.append(candidate_bullets["consistency"])
    return bullets[:3]


def leaderboard_entries(contributors: list[dict[str, Any]], dimension: str) -> list[dict[str, Any]]:
    ordered = sorted(
        contributors,
        key=lambda contributor: (
            -contributor["scores"][dimension]["score"],
            -contributor["scores"][dimension]["raw"],
            contributor["identity"]["login"].lower(),
        ),
    )
    entries = []
    for contributor in ordered[:5]:
        entries.append(
            {
                "identity": contributor["identity"],
                "impact_rank": contributor["ranking"]["rank"],
                "impact_score": contributor["ranking"]["impact_score"],
                "dimension_score": contributor["scores"][dimension]["score"],
                "dimension_raw": contributor["scores"][dimension]["raw"],
            }
        )
    return entries


def sort_for_ranking(contributors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        contributors,
        key=lambda contributor: (
            -contributor["_impact_score_unrounded"],
            -contributor["scores"]["shipping"]["score"],
            contributor["identity"]["login"].lower(),
        ),
    )


def build_output_shell(repo: str, window_days: int) -> dict[str, Any]:
    return {
        "generated_at": to_github_datetime(utc_now()),
        "repo": repo,
        "window_days": window_days,
        "window_start": None,
        "window_end": None,
        "partial": False,
        "coverage": None,
        "methodology": {
            "weights": WEIGHTS,
            "dimension_formulas": {
                "shipping": "merged_prs + (issues_closed * 2) + code_reduction_bonus",
                "enablement": "reviews_given * (1 + log(1 + avg_comments_per_review)) * response_time_factor",
                "complexity": "avg_discussion_comments_per_pr + ((total_issue_age_days / max(1, issues_closed)) / 30)",
                "consistency": "(active_weeks / 13) * 100",
            },
            "inclusion_rule": "Contributor must have at least 1 merged PR or at least 3 reviews in the 90-day window.",
            "tie_breaker": "impact_score desc, shipping_score desc, login asc",
        },
        "leaders": [],
        "leaderboards": {
            "shipping": [],
            "enablement": [],
            "complexity": [],
            "consistency": [],
        },
        "contributors": [],
    }


def main() -> None:
    args = parse_args()
    output = build_output_shell(args.repo, args.window_days)
    input_path = Path(args.input)

    if not input_path.exists():
        write_json(Path(args.output), output)
        print(f"No raw snapshot found at {input_path}; wrote empty contract to {args.output}")
        return

    raw = read_json(input_path)
    repo = raw.get("repo", args.repo)
    window_days = int(raw.get("window_days", args.window_days))
    output = build_output_shell(repo, window_days)
    output["generated_at"] = raw.get("generated_at") or to_github_datetime(utc_now())
    output["window_start"] = raw.get("window_start")
    output["window_end"] = raw.get("window_end")
    output["partial"] = bool(raw.get("partial", False))
    output["coverage"] = raw.get("coverage")

    profiles = raw.get("user_profiles", {})
    contributors: dict[str, dict[str, Any]] = {}

    for pr in raw.get("pull_requests", []):
        author = pr.get("author") or {}
        author_login = author.get("login")
        discussion_comment_total = len(pr.get("issue_comments", [])) + len(pr.get("review_comments", []))

        if author_login and not is_bot_login(author_login):
            contributor = ensure_contributor(contributors, profiles, author_login, author)
            contributor["stats"]["merged_prs"] += 1
            contributor["stats"]["total_additions"] += pr.get("additions") or 0
            contributor["stats"]["total_deletions"] += pr.get("deletions") or 0
            contributor["_discussion_comment_total"] += discussion_comment_total
            merged_week = week_key(pr.get("merged_at"))
            if merged_week:
                contributor["_active_weeks"].add(merged_week)

            for issue in pr.get("referenced_issues", []):
                if issue.get("is_pull_request") or not issue.get("closed_at"):
                    continue
                issue_number = issue.get("number")
                if issue_number in contributor["_closed_issues"]:
                    continue
                contributor["_closed_issues"][issue_number] = compute_issue_age_days(
                    issue.get("created_at"),
                    issue.get("closed_at"),
                )

        review_comment_counts = Counter(
            comment.get("pull_request_review_id")
            for comment in pr.get("review_comments", [])
            if comment.get("pull_request_review_id")
        )
        first_reviews_by_login: dict[str, str] = {}
        for review in pr.get("reviews", []):
            review_user = review.get("user") or {}
            reviewer_login = review_user.get("login")
            submitted_at = review.get("submitted_at")
            if not reviewer_login or is_bot_login(reviewer_login) or not submitted_at:
                continue

            contributor = ensure_contributor(contributors, profiles, reviewer_login, review_user)
            contributor["stats"]["reviews_given"] += 1
            contributor["_review_comment_counts"].append(review_comment_counts.get(review.get("id"), 0))
            review_week = week_key(submitted_at)
            if review_week:
                contributor["_active_weeks"].add(review_week)

            first_review = first_reviews_by_login.get(reviewer_login)
            if first_review is None or submitted_at < first_review:
                first_reviews_by_login[reviewer_login] = submitted_at

        for reviewer_login, submitted_at in first_reviews_by_login.items():
            contributors[reviewer_login]["_response_hours"].append(hours_between(pr["created_at"], submitted_at))

    eligible_contributors: dict[str, dict[str, Any]] = {}
    for login, contributor in contributors.items():
        stats = contributor["stats"]
        stats["issues_closed"] = len(contributor["_closed_issues"])
        stats["total_issue_age_days"] = round_number(sum(contributor["_closed_issues"].values()), 1)
        stats["avg_discussion_comments_per_pr"] = round_number(
            contributor["_discussion_comment_total"] / max(stats["merged_prs"], 1), 1
        )
        stats["avg_comments_per_review"] = round_number(
            statistics.fmean(contributor["_review_comment_counts"]) if contributor["_review_comment_counts"] else 0.0,
            1,
        )
        stats["median_response_hours"] = (
            round_number(statistics.median(contributor["_response_hours"]), 1)
            if contributor["_response_hours"]
            else None
        )
        stats["active_weeks"] = len(contributor["_active_weeks"])

        if stats["total_deletions"] > stats["total_additions"]:
            delta = stats["total_deletions"] - stats["total_additions"]
            denominator = max(stats["total_additions"], 1)
            stats["code_reduction_bonus"] = round_number(min(20.0, (delta / denominator) * 20.0), 1)

        if stats["merged_prs"] >= 1 or stats["reviews_given"] >= 3:
            eligible_contributors[login] = contributor

    shipping_raw: dict[str, float] = {}
    enablement_raw: dict[str, float] = {}
    complexity_raw: dict[str, float] = {}
    consistency_scores: dict[str, float] = {}
    response_hours = {
        login: contributor["stats"]["median_response_hours"]
        for login, contributor in eligible_contributors.items()
        if contributor["stats"]["median_response_hours"] is not None
    }
    normalized_response = normalize_0_1(response_hours)

    for login, contributor in eligible_contributors.items():
        stats = contributor["stats"]
        shipping_raw[login] = stats["merged_prs"] + (stats["issues_closed"] * 2) + stats["code_reduction_bonus"]

        response_factor = 1.0
        if stats["reviews_given"] > 0 and stats["median_response_hours"] is not None:
            response_factor = 1 + (1 - normalized_response.get(login, 1.0))
        enablement_raw[login] = stats["reviews_given"] * (
            1 + math.log1p(stats["avg_comments_per_review"])
        ) * response_factor

        average_issue_age_months = (
            (stats["total_issue_age_days"] / max(stats["issues_closed"], 1)) / 30
            if stats["issues_closed"] > 0
            else 0.0
        )
        complexity_raw[login] = stats["avg_discussion_comments_per_pr"] + average_issue_age_months
        consistency_scores[login] = min((stats["active_weeks"] / 13) * 100, 100.0)

    shipping_scores = normalize_0_100(shipping_raw)
    enablement_scores = normalize_0_100(enablement_raw)
    complexity_scores = normalize_0_100(complexity_raw)

    ranked_contributors: list[dict[str, Any]] = []
    for login, contributor in eligible_contributors.items():
        scores = {
            "shipping": {
                "raw": round_number(shipping_raw[login], 2),
                "score": round_number(shipping_scores[login], 1),
                "weight": WEIGHTS["shipping"],
                "contribution": round_number(shipping_scores[login] * WEIGHTS["shipping"], 1),
            },
            "enablement": {
                "raw": round_number(enablement_raw[login], 2),
                "score": round_number(enablement_scores[login], 1),
                "weight": WEIGHTS["enablement"],
                "contribution": round_number(enablement_scores[login] * WEIGHTS["enablement"], 1),
            },
            "complexity": {
                "raw": round_number(complexity_raw[login], 2),
                "score": round_number(complexity_scores[login], 1),
                "weight": WEIGHTS["complexity"],
                "contribution": round_number(complexity_scores[login] * WEIGHTS["complexity"], 1),
            },
            "consistency": {
                "raw": round_number(consistency_scores[login], 2),
                "score": round_number(consistency_scores[login], 1),
                "weight": WEIGHTS["consistency"],
                "contribution": round_number(consistency_scores[login] * WEIGHTS["consistency"], 1),
            },
        }

        impact_score_unrounded = (
            shipping_scores[login] * WEIGHTS["shipping"]
            + enablement_scores[login] * WEIGHTS["enablement"]
            + complexity_scores[login] * WEIGHTS["complexity"]
            + consistency_scores[login] * WEIGHTS["consistency"]
        )

        contributor["scores"] = scores
        contributor["_impact_score_unrounded"] = impact_score_unrounded
        ranked_contributors.append(contributor)

    ranked_contributors = sort_for_ranking(ranked_contributors)
    for index, contributor in enumerate(ranked_contributors, start=1):
        contributor["ranking"] = {
            "rank": index,
            "impact_score": round_number(contributor["_impact_score_unrounded"], 1),
        }
        contributor["why_it_matters"] = generate_why_it_matters(contributor)

    output["contributors"] = [
        {
            "identity": contributor["identity"],
            "ranking": contributor["ranking"],
            "scores": contributor["scores"],
            "stats": contributor["stats"],
            "why_it_matters": contributor["why_it_matters"],
        }
        for contributor in ranked_contributors
    ]
    output["leaders"] = output["contributors"][:5]
    output["leaderboards"] = {
        "shipping": leaderboard_entries(ranked_contributors, "shipping"),
        "enablement": leaderboard_entries(ranked_contributors, "enablement"),
        "complexity": leaderboard_entries(ranked_contributors, "complexity"),
        "consistency": leaderboard_entries(ranked_contributors, "consistency"),
    }

    write_json(Path(args.output), output)
    print(f"Wrote {len(output['contributors'])} ranked contributors to {args.output}")


if __name__ == "__main__":
    main()
