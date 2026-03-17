# Backend Data Pipeline

This feature uses an offline Python pipeline. Runtime code should only read `data/engineers.json`.

## Commands

Fetch and cache GitHub data:

```bash
python3 scripts/github/fetch_engineer_impact_data.py
```

Generate the frontend-ready payload:

```bash
python3 scripts/github/score_engineer_impact.py
```

Assemble a partial raw snapshot from whatever is already cached:

```bash
python3 scripts/github/assemble_partial_engineer_impact_data.py
python3 scripts/github/score_engineer_impact.py
```

Refresh cached GitHub responses:

```bash
python3 scripts/github/fetch_engineer_impact_data.py --refresh
```

## Inputs and outputs

- Requires `GITHUB_TOKEN` in the environment
- You can also put `GITHUB_TOKEN=...` in a local `.env` file at the repo root
- Raw snapshot: `data/cache/github/engineer_impact_raw.json`
- Final payload: `data/engineers.json`
- Endpoint-level response cache: `data/cache/github/*.json`

## Notes

- The fetch step fails immediately if `GITHUB_TOKEN` is missing from both the environment and `.env`.
- Bots are filtered using both a `[bot]` suffix heuristic and a fixed denylist.
- If the scoring script runs before raw data exists, it writes an empty but valid `data/engineers.json` contract so the frontend can still build against the shape.
- `assemble_partial_engineer_impact_data.py` is a cache-only fallback for oversized fetch runs; it writes a partial snapshot and marks the final JSON with `partial: true` and coverage metadata.
