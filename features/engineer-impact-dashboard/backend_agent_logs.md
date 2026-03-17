# Backend Agent Log

## 2026-03-17 07:25 UTC

Feature: `engineer-impact-dashboard`

Summary of completed work:
- Implemented an offline GitHub REST pipeline in `scripts/github/`.
- Added a cached fetch stage that pulls merged PRs in the last 90 days, reviews, review comments, issue comments, referenced issues, and contributor profiles.
- Added a scoring stage that aggregates per-contributor metrics, applies the four impact dimensions, ranks contributors deterministically, and writes `data/engineers.json`.
- Added `.env` support for local `GITHUB_TOKEN` loading.
- Added a cache-only partial assembler in `scripts/github/assemble_partial_engineer_impact_data.py`.
- Added backend regeneration instructions in `features/engineer-impact-dashboard/backend_readme.md`.

Technical decisions made:
- Used standard-library Python only to avoid adding package-management overhead to a minimal repo.
- Split the pipeline into `fetch_engineer_impact_data.py` and `score_engineer_impact.py` so API work and scoring logic stay separable.
- Cached individual GitHub API responses under `data/cache/github/` and also emit a consolidated raw snapshot for repeatable scoring runs.
- Stopped PR pagination using `sort=updated&direction=desc`; once an entire page is older than the window and contains no in-window merges, later pages cannot contain relevant merges.
- Fetched GitHub user profiles to provide a frontend-ready identity contract with `display_name`, avatar, and profile URL.
- Wrote an empty but valid `data/engineers.json` when no raw snapshot exists so the frontend has a stable schema before live data is generated.

Assumptions made:
- Counting all submitted non-bot reviews is an acceptable interpretation of "reviews given"; the script excludes entries without `submitted_at`.
- Complexity discussion depth counts all PR issue comments and review comments on a merged PR, regardless of author.
- Issue closure is credited when the PR body references an issue using `closes`, `fixes`, or `resolves` patterns and the referenced issue is actually closed.
- Code reduction bonus uses `max(total_additions, 1)` as the denominator to avoid divide-by-zero cases on deletion-only work.

Risks, edge cases, and follow-up work:
- GitHub review payloads can contain states like `DISMISSED`; if product wants a narrower definition of review activity, the filter may need tightening.
- Issue reference parsing currently handles the documented keywords and `#123` style references; more exotic body formats are intentionally ignored.
- A full token-backed fetch against `PostHog/posthog` proved much larger than the original implementation estimate. The fallback path now assembles a partial dataset from cache, but a more scalable fetch strategy is still needed for complete coverage.

Anything the frontend agent or technical lead should know:
- `data/engineers.json` is the stable contract the frontend should import.
- The current `data/engineers.json` is no longer empty, but it is explicitly marked `partial: true` with coverage metadata so the UI can disclose the limitation.
