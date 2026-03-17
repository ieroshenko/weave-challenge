# Engineer Impact Dashboard Implementation Plan

## Feature Overview

Build a single-page dashboard that shows the top 5 most impactful engineers in `PostHog/posthog` over the last 90 days using pre-computed GitHub data. The MVP should optimize for trust, interpretability, and fast load time.

This implementation should stay simple:
- No Supabase
- No runtime backend server
- Data fetched offline via script
- Processed output stored in local JSON and consumed directly by the frontend

## MVP Outcome

The shipped MVP should:
- Fetch GitHub activity for the last 90 days from `PostHog/posthog`
- Aggregate and score contributors using the 4 documented impact dimensions
- Write a frontend-ready JSON payload to `data/engineers.json`
- Render a single-page dashboard with ranked engineer cards, dimension leaderboards, and an inline methodology panel

## Technical Assumptions

- GitHub REST API is the only required external integration
- `GITHUB_TOKEN` is available locally when data-fetch scripts run
- Runtime app will not call GitHub directly
- The repo is public, but authenticated requests are still required for rate-limit headroom
- Bot filtering should use both username suffix matching (`[bot]`) and a known denylist
- Contributor inclusion rule is: at least 1 merged PR or at least 3 reviews in the 90-day window
- Tie-breaker for final ranking is shipping score, then composite score order stability by username

## Architecture Summary

### High-level flow

1. Offline fetch script pulls raw GitHub data for the 90-day window
2. Raw responses are cached to disk to reduce repeated API usage
3. Processing script normalizes raw GitHub data into contributor-centric metrics
4. Scoring step computes dimension scores, composite score, rank, and explanation bullets
5. Final payload is written to `data/engineers.json`
6. Frontend imports the JSON at build time and renders static UI

### Recommended project structure

```text
features/engineer-impact-dashboard/
  implementation_plan.md

scripts/
  github/
    fetch_engineer_impact_data.py
    score_engineer_impact.py
    shared.py

data/
  cache/
    github/
  engineers.json
```

### Pipeline split

- Fetch stage: gather raw PR, review, comment, and issue data and cache it
- Transform stage: flatten GitHub entities into per-engineer metrics
- Score stage: compute normalized dimension scores and top-5 ranking
- Present stage: shape a frontend-ready JSON contract with no further client-side computation required beyond display formatting

## Data Model and Output Contract

### Raw collection entities

- Pull request
  - `number`, `title`, `user.login`, `created_at`, `merged_at`, `body`
  - `additions`, `deletions`
- Pull request reviews
  - `user.login`, `state`, `submitted_at`
- Pull request review comments
  - `user.login`, `pull_request_review_id`, `created_at`
- Pull request issue comments
  - `user.login`, `created_at`
- Referenced issues
  - `number`, `created_at`, `closed_at`

### Derived per-engineer metrics

- `merged_prs`
- `issues_closed`
- `total_additions`
- `total_deletions`
- `code_reduction_bonus`
- `reviews_given`
- `avg_comments_per_review`
- `median_response_hours`
- `avg_discussion_comments_per_pr`
- `total_issue_age_days`
- `active_weeks`

### Dimension outputs

- `shipping.raw`, `shipping.score`
- `enablement.raw`, `enablement.score`
- `complexity.raw`, `complexity.score`
- `consistency.raw`, `consistency.score`
- `impact_score`

### Frontend-ready JSON shape

Recommended top-level structure:

```json
{
  "generated_at": "ISO-8601",
  "repo": "PostHog/posthog",
  "window_days": 90,
  "methodology": {
    "weights": {
      "shipping": 0.30,
      "enablement": 0.30,
      "complexity": 0.25,
      "consistency": 0.15
    }
  },
  "leaders": [...top_5_engineers],
  "leaderboards": {
    "shipping": [...top_5],
    "enablement": [...top_5],
    "complexity": [...top_5],
    "consistency": [...top_5]
  },
  "contributors": [...all_ranked_contributors]
}
```

Each engineer record should include:
- identity: `login`, `display_name`, `avatar_url`, `profile_url`
- ranking: `rank`, `impact_score`
- scores: all four dimension score objects and weight contributions
- raw stats used in UI
- `why_it_matters`: 2 to 3 plain-English bullets

## Backend Workstream

The backend agent owns all offline data preparation and the final JSON contract.

### Backend deliverables

- GitHub fetch script
- Disk cache for raw API responses
- Processing/scoring script
- Frontend-ready `data/engineers.json`
- Short README/run instructions for regenerating data

### Backend tasks

1. Define the output schema for `data/engineers.json`
Dependency: none
Notes: Lock this first so frontend can build against a stable contract.

2. Implement GitHub API client utilities
Dependency: task 1 can happen in parallel
Notes: Handle auth header, pagination, backoff/retry, and cache reads/writes.

3. Implement merged PR fetch for the 90-day window
Dependency: task 2
Notes: Pull closed PRs, retain only merged PRs inside the date window, and capture additions/deletions/body metadata.

4. Implement per-PR enrichment fetches
Dependency: task 3
Notes: For each relevant PR, fetch reviews, review comments, issue comments, and referenced issues from parsed PR body references.

5. Implement bot filtering and contributor eligibility rules
Dependency: tasks 3 and 4
Notes: Exclude bots globally before scoring; include humans with at least 1 merged PR or 3 reviews.

6. Build contributor aggregation layer
Dependency: tasks 3, 4, 5
Notes: Convert PR-centric data into engineer-centric metrics; compute active weeks using merged PRs and reviews.

7. Implement scoring formulas and normalization
Dependency: task 6
Notes: Use min-max normalization for shipping, enablement, and complexity; consistency stays direct; handle zero-variance cases by assigning equal normalized scores or zero by documented rule.

8. Implement tie-breaking and ranking
Dependency: task 7
Notes: Sort by composite score descending, then shipping score descending, then login ascending for deterministic output.

9. Generate explanation bullets
Dependency: tasks 6 and 7
Notes: Derive from actual metrics only; avoid template output disconnected from data.

10. Write final `data/engineers.json`
Dependency: tasks 8 and 9
Notes: Include top 5 leaders, dimension leaderboards, and full contributor list for debugging or later expansion.

11. Add regeneration command and failure behavior
Dependency: tasks 2 through 10
Notes: Fail clearly when `GITHUB_TOKEN` is missing; document how to refresh data.

12. Validate output against the product doc success criteria
Dependency: task 10
Notes: Spot-check data completeness, top-5 shape, bot exclusion, and metric presence.

### Backend implementation notes

- Prefer two scripts if that keeps responsibilities clean:
  - `fetch_engineer_impact_data.py` for raw collection and caching
  - `score_engineer_impact.py` for aggregation and final JSON generation
- If iteration speed matters more than purity, a single script is acceptable, but keep fetch and transform functions clearly separated.
- Cache by endpoint and page to avoid hammering GitHub while debugging.
- Parse issue references with explicit regex support for `fixes`, `closes`, and `resolves`.
- Review depth should count review comments grouped by submitted review where possible; if GitHub API linkage is incomplete, document fallback behavior clearly.

## Frontend Workstream

The frontend agent owns rendering the precomputed dataset into a clear, fast, single-screen dashboard.

### Frontend deliverables

- Single-page React dashboard
- Ranked top-5 engineer cards
- Four dimension mini-leaderboards
- Inline methodology panel
- Loading-safe handling for static JSON import

### Frontend tasks

1. Define TypeScript types for the JSON contract
Dependency: backend task 1
Notes: Frontend should align to a stable schema before component work expands.

2. Create page layout shell
Dependency: none
Notes: Header with title, 90-day window label, methodology trigger, and primary content regions.

3. Build top-5 ranked card component
Dependency: task 1
Notes: Show rank, avatar, name, impact score, segmented dimension bar, explanation bullets, and raw stat chips.

4. Build dimension contribution bar component
Dependency: task 1
Notes: Visually break composite score into weighted dimension segments with labels/colors.

5. Build four mini-leaderboards
Dependency: task 1
Notes: Shipping, enablement, complexity, and consistency each show top 5 contributors for that dimension.

6. Build methodology panel
Dependency: none
Notes: Inline expandable section is sufficient; explain weights, formulas, and score intent in plain English.

7. Add static data loading path
Dependency: backend task 10
Notes: Import `data/engineers.json` at build time; avoid runtime fetches unless tooling requires it.

8. Handle empty/error states for missing data
Dependency: task 7
Notes: Keep this minimal but explicit so the page does not fail silently during development.

9. Refine visual hierarchy for scanability
Dependency: tasks 2 through 7
Notes: Optimize for laptop viewport and 10-second comprehension, not dense analytics UI.

10. Verify responsiveness and performance
Dependency: tasks 2 through 9
Notes: Ensure the page remains readable on smaller widths and ships with no unnecessary runtime work.

### Frontend implementation notes

- The frontend should not reproduce scoring logic; it should display precomputed values.
- Use Recharts only where it adds clarity; simple CSS bars may be better for the segmented score display.
- The methodology panel should mirror the backend formulas exactly to avoid trust gaps.
- Keep labels explicit: avoid unlabeled percentages or ambiguous chips.

## Shared Dependencies and Sequencing

### Decisions to lock first

- Final JSON schema
- Bot filter list plus `[bot]` heuristic
- Exact handling for normalization when all contributors have the same raw score
- Whether the frontend consumes all contributors or only the summarized `leaders` plus `leaderboards`

### Recommended execution sequence

1. Backend defines JSON contract
2. Frontend types against that contract and starts layout/components with mocked JSON
3. Backend builds fetch, cache, aggregation, and scoring pipeline
4. Backend generates first real `data/engineers.json`
5. Frontend swaps mock data for real data and tunes presentation
6. Final pass validates formulas, labels, and UX requirements

### Parallelization opportunities

- Frontend can begin immediately after schema definition using a mocked payload
- Backend fetch/cache implementation can proceed independently of most UI work
- Methodology copy and formula presentation can be built in parallel with data pipeline work

## Risks and Unknowns

### Data quality risks

- Review comment attribution may not perfectly map to each submitted review without careful grouping
- Issue-closing references in PR bodies may miss non-standard phrasing
- GitHub user display names may be null or inconsistent; fallback to login is required

### Technical risks

- Large PR volume may make per-PR enrichment slow without caching
- Rate limits may still be hit if cache invalidation is too aggressive
- Normalization edge cases can make scores misleading if zero-variance handling is not defined

### Product risks

- High discussion count is only a proxy for complexity and may sometimes reflect churn
- External reviewers may rank highly, which is acceptable per the doc but could surprise stakeholders

## Suggested MVP Delivery Order

1. Lock JSON schema and ranking rules
2. Implement fetch script with caching and merged PR retrieval
3. Implement enrichment for reviews, comments, and issues
4. Aggregate metrics and compute scores
5. Generate `data/engineers.json`
6. Build top-5 dashboard cards and stat chips
7. Build methodology panel and dimension leaderboards
8. Validate scoring output and polish layout

## Open Questions Needing Clarification

- Should `data/engineers.json` be committed to the repo for deterministic review, or generated locally only?
- Should display name prefer GitHub `name` when available, or always use login for consistency?
- For zero-variance normalized dimensions, should everyone receive `0`, `100`, or the same midpoint score?
- Do we want to expose the full ranked contributor list in the shipped JSON, or keep only the data needed for the visible UI?
- Should review response time be displayed in hours with one decimal, or rounded to whole hours for readability?

## Recommended Assignment Split

### Backend agent

- Own JSON contract
- Own GitHub fetch/caching scripts
- Own aggregation and score computation
- Own final generated dataset
- Provide a sample payload early for frontend integration

### Frontend agent

- Own dashboard layout and components
- Own methodology panel and explanatory copy rendering
- Own responsive behavior and visual hierarchy
- Own static data integration once sample payload is available

### Shared coordination

- Confirm schema before major implementation
- Confirm formula wording matches processing logic
- Validate that displayed labels map directly to raw metrics and score components
