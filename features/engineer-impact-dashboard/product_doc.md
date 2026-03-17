# Product Doc: Engineer Impact Dashboard

## Feature Summary

A single-page, interactive dashboard that identifies the **top 5 most impactful engineers** on the PostHog GitHub repository over the last 90 days. Built for a busy engineering leader who needs to understand contributions at a glance without reading every PR or commit.

The dashboard answers: *"Who is doing the most valuable work, and why?"*

---

## Problem Statement

Raw GitHub activity metrics (commits, lines added, files changed) are misleading proxies for impact. A senior engineer who writes one critical architectural change is more impactful than someone who opens 50 minor PRs. An engineer who does deep code reviews unblocks the whole team but leaves a smaller personal commit footprint.

Engineering leaders need a defensible, multi-dimensional view of impact — not a simple leaderboard by commit count.

---

## Target Users

**Primary**: Engineering leader at PostHog who is familiar with the team but not in the weeds of every PR. They need to be able to quickly understand and defend the rankings in a conversation.

---

## Why This Matters

- Leaders making staffing, promotion, or recognition decisions need signal beyond gut feel
- Activity-based metrics can actively mislead (penalize focused engineers, reward churn)
- A transparent, multi-dimensional score builds trust in the analysis

---

## Goals

1. Correctly identify the 5 engineers with highest real-world impact over the last 90 days
2. Make every score interpretable — no magic numbers
3. Load instantly (pre-computed data, no live API calls)
4. Fit on a single laptop screen

---

## Non-Goals

- This is not a performance review tool or HR system
- Not a real-time dashboard (data is pre-fetched and baked in)
- Not a complete org-wide ranking (top 5 is sufficient)
- No authentication or user management required
- No database or backend server needed at runtime

---

## Impact Framework

Impact is measured across **4 dimensions**, each contributing to a composite score.

### Dimension 1: Shipping Impact (30% weight)

*Did your work move the product forward?*

| Metric | Description |
|--------|-------------|
| Merged PRs | Count of PRs merged to the default branch in the last 90 days |
| Code reduction bonus | Net lines deleted beyond adds signals cleanup/simplification; scored on a curve (max +20% bonus) |
| Issues resolved | Count of issues closed via merged PRs (PR body references `fixes #N`, `closes #N`) |

**Raw score formula:**
```
shipping_raw = merged_prs + (issues_closed * 2) + code_reduction_bonus
```
Where `code_reduction_bonus = min(20, max(0, (total_deletions - total_additions) / total_additions * 20))` — only awarded when net negative (deleting more than adding).

Scores are then normalized 0–100 across all contributors (min-max normalization).

### Dimension 2: Team Enablement (30% weight)

*Did you make others faster?*

| Metric | Description |
|--------|-------------|
| Reviews given | Count of PR reviews submitted (approvals + change requests + comment reviews) |
| Review depth | Average comments left per review (more comments = more substantive feedback) |
| Review response time | Median hours from PR creation to the engineer's first review submission across all PRs they reviewed |

An engineer who rubber-stamps 20 PRs scores less than one who leaves 3 deep, comment-rich reviews. Fast responders score higher on response time (inverse relationship — lower hours = higher score).

**Raw score formula:**
```
enablement_raw = reviews_given * (1 + log(1 + avg_comments_per_review)) * response_time_factor
```
Where `response_time_factor = 1 + (1 - normalized_median_response_hours)` — ranges from 1.0 (slowest) to 2.0 (fastest). This multiplies the base review score, so responsiveness amplifies but doesn't dominate.

Scores normalized 0–100.

**Data needed**: For each PR reviewed, record the PR's `created_at` and the reviewer's first `submitted_at` timestamp. Use median (not mean) to avoid skew from outlier reviews submitted on very old PRs.

### Dimension 3: Complexity Absorption (25% weight)

*Did you tackle the hard, ambiguous problems others avoided?*

| Metric | Description |
|--------|-------------|
| PR discussion depth | Average total comment count (PR comments + review comments) across the engineer's merged PRs. High discussion = more complex, debated work. |
| Long-standing issues closed | Sum of ages (in days) of issues closed via the engineer's merged PRs, where issue age = `issue_closed_at - issue_created_at`. Closing a 180-day-old issue scores much higher than closing a 2-day-old issue. |

A high score here means the engineer consistently takes on difficult, contested work and resolves problems that have lingered. It's an inverse signal of cherry-picking easy tasks.

**Raw score formula:**
```
complexity_raw = avg_comments_per_pr + (total_issue_age_days / max(1, issues_closed) / 30)
```
The second term converts average issue age to months, putting it on a comparable scale to comment counts.

Scores normalized 0–100.

**Data needed**: For PRs authored, total comment count (issue comments + review comments on that PR). For issues resolved by PRs, the issue's `created_at` date.

### Dimension 4: Consistency (15% weight)

*Are you a reliable contributor or a burst contributor?*

| Metric | Description |
|--------|-------------|
| Active weeks | Number of distinct calendar weeks with at least 1 merged PR or 1 review given (out of 13 possible weeks in 90 days) |

**Raw score formula:**
```
consistency_score = (active_weeks / 13) * 100
```

No normalization needed — already 0–100.

---

### Composite Score

```
impact_score = (shipping_score * 0.30) + (enablement_score * 0.30) + (complexity_score * 0.25) + (consistency_score * 0.15)
```

Final score is rounded to one decimal place and displayed with a breakdown.

---

## MVP Scope

### Data Collection (Python script)

- Fetch the last 90 days of activity from the PostHog GitHub repo (`PostHog/posthog`) using the **GitHub REST API**
- Requires a `GITHUB_TOKEN` environment variable (read-only, public repo scope sufficient)
- Collect:
  - All merged PRs (author, merge date, additions, deletions, body text for issue refs, total comment count)
  - All PR reviews (reviewer, PR number, `submitted_at`) — for review count, depth, and response time
  - All PR review comments (reviewer, `created_at`) — for avg_comments_per_review
  - PR issue comments (`created_at`) — combined with review comments for total discussion depth per PR
  - For PRs that close issues: fetch the referenced issue's `created_at` to compute issue age at close
  - PR `created_at` timestamps — needed to compute reviewer response time
- Output: single `data/engineers.json` file consumed by the frontend

**Important**: The script must handle GitHub API pagination and rate limiting. Cache responses where possible to avoid re-fetching.

**Data quality requirement**: Must include all contributors with ≥1 merged PR or ≥3 reviews in the window. Do not pre-filter to known team members — derive the contributor list from the data.

### Analysis

Compute the composite impact score for every contributor, then return the top 5 with full metric breakdown. Include a "why they rank here" summary for each engineer — 2–3 plain English bullet points derived directly from their metrics (e.g., "Merged 23 PRs across 11 of 13 weeks", "Left an average of 4.2 review comments per review").

### Frontend (React + Vite + TypeScript + shadcn/ui + Recharts)

Single page, no routing needed. Layout:

```
┌────────────────────────────────────────────────────────────────┐
│  PostHog Engineer Impact  │  Last 90 days  │  Methodology [?]  │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TOP 5 MOST IMPACTFUL ENGINEERS                                  │
│                                                                  │
│  Ranked cards (1–5), each showing:                              │
│  - Rank badge + GitHub avatar + name                            │
│  - Composite score (labeled, not raw)                           │
│  - Score bar broken into 4 colored segments (dimensions)        │
│  - 2–3 bullet "why they rank here" insights                     │
│  - 4 stat chips: [X PRs merged] [Y reviews] [Z issues closed]  │
│                  [Avg Wresponse time]                           │
│                                                                  │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Shipping    │  Team        │  Complexity  │  Consistency       │
│  Leaderboard │  Enablement  │  Absorption  │  (active weeks)    │
│  (top 5)     │  Leaderboard │  Leaderboard │                    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

**Methodology panel**: Clicking `[?]` opens a side panel (or expands inline) explaining each dimension, its weight, and the formula in plain English. No magic numbers.

---

## Key Data

| Data Point | Source |
|---|---|
| Merged PRs | GitHub REST: `GET /repos/PostHog/posthog/pulls?state=closed&per_page=100` (filter for merged) |
| PR `created_at` | Included in PR payload — used for reviewer response time |
| PR reviews | GitHub REST: `GET /repos/PostHog/posthog/pulls/{pr_number}/reviews` — includes `submitted_at` for response time |
| PR review comments | GitHub REST: `GET /repos/PostHog/posthog/pulls/{pr_number}/comments` — for avg comments per review |
| PR issue comments | GitHub REST: `GET /repos/PostHog/posthog/issues/{pr_number}/comments` — combined for total discussion depth |
| PR body (issue refs) | Included in PR payload — parse for `closes #N`, `fixes #N`, `resolves #N` |
| Referenced issue age | GitHub REST: `GET /repos/PostHog/posthog/issues/{issue_number}` — fetch `created_at` for age at close calculation |

---

## UX Requirements

1. **No magic scores**: Every number shown must have a label that explains what it is
2. **Scannable in 10 seconds**: An engineering leader should understand the top 5 at a glance
3. **Validatable**: Stats (PRs merged, reviews, issues) should be raw numbers visible alongside the score
4. **Fast**: All data pre-baked into the JS bundle — zero API calls at runtime, loads in <2s
5. **Methodology is accessible**: One click to understand how scores are calculated

---

## Success Criteria

- [ ] Dashboard loads in under 2 seconds
- [ ] Top 5 engineers displayed with composite scores and dimension breakdowns
- [ ] Each engineer card shows raw stats (PRs merged, reviews given, avg response time, issues closed, avg PR discussion depth, active weeks)
- [ ] Methodology panel explains the scoring formula in plain English
- [ ] Data covers full last 90 days from the PostHog GitHub repo
- [ ] No engineer appears due to bot activity (filter out known bots: `dependabot`, `github-actions`, etc.)

---

## Risks and Assumptions

| Risk | Mitigation |
|---|---|
| GitHub API rate limits | Use authenticated requests (GITHUB_TOKEN); implement pagination with delays if needed; cache to disk |
| Bot accounts inflating scores | Filter out: `dependabot[bot]`, `github-actions[bot]`, `posthog-bot`, `renovate[bot]` |
| PR reviews from external contributors distorting "team" signal | No filter — external reviewers who are highly active are legitimately impactful |
| Issues closed count undercounting | Parse PR body for common patterns; some issues may be closed manually (acceptable gap) |
| Score tied at same composite | Break ties by shipping impact score first |

---

## Open Questions

- Should bots be filtered by a hardcoded list or by a heuristic (e.g., `[bot]` suffix in username)? → **Use both**: filter `[bot]` suffix AND a known-bad list.
- Should the `[?]` methodology panel be a modal or an inline expandable? → **Inline expandable** (simpler, faster to implement, always accessible).
- Is a GitHub token available in the environment? → The data collection script should read from `GITHUB_TOKEN` env var and fail clearly if not set.
