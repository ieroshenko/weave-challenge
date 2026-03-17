import type {
  DimensionKey,
  DimensionScore,
  DimensionWeights,
  EngineerImpactDataset,
  EngineerStats,
  ImpactEngineer,
} from "../types/engineers";

export const DIMENSION_ORDER: DimensionKey[] = [
  "shipping",
  "enablement",
  "complexity",
  "consistency",
];

export const DEFAULT_WEIGHTS: DimensionWeights = {
  shipping: 0.3,
  enablement: 0.3,
  complexity: 0.25,
  consistency: 0.15,
};

export const DIMENSION_META: Record<
  DimensionKey,
  {
    label: string;
    shortLabel: string;
    color: string;
    accent: string;
    description: string;
    plainEnglish: string;
    signals: string[];
  }
> = {
  shipping: {
    label: "Shipping Impact",
    shortLabel: "Shipping",
    color: "bg-shipping",
    accent: "text-shipping",
    description: "Who is moving product work into the default branch.",
    plainEnglish:
      "This score rises when someone lands more merged PRs, closes issues through those PRs, and gets extra credit for cleanup-heavy changes that delete more code than they add.",
    signals: [
      "Merged PR count is the base signal.",
      "Closing issues counts double because it ties work to resolved outcomes.",
      "Net code reduction adds a capped bonus for simplification work.",
    ],
  },
  enablement: {
    label: "Team Enablement",
    shortLabel: "Enablement",
    color: "bg-enablement",
    accent: "text-enablement",
    description: "Who is making other engineers faster through reviews.",
    plainEnglish:
      "This score rewards reviewers who show up often, leave substantive comments, and respond earlier in a pull request’s lifecycle instead of reviewing late.",
    signals: [
      "More submitted reviews increase the baseline score.",
      "Comment-rich reviews count more than quick approvals.",
      "Faster first-response times amplify the review score rather than replacing it.",
    ],
  },
  complexity: {
    label: "Complexity Absorption",
    shortLabel: "Complexity",
    color: "bg-complexity",
    accent: "text-complexity",
    description: "Who is taking on the most ambiguous or debated work.",
    plainEnglish:
      "This score goes up when an engineer’s merged PRs attract deeper discussion and when they close older issues that the team had not solved for a long time.",
    signals: [
      "PRs with more comments suggest harder or more debated work.",
      "Closing older issues increases the score because lingering problems are usually harder.",
      "Issue age is averaged so one old issue helps, but does not dominate everything else.",
    ],
  },
  consistency: {
    label: "Consistency",
    shortLabel: "Consistency",
    color: "bg-consistency",
    accent: "text-consistency",
    description: "Who is showing up reliably across the full 90-day window.",
    plainEnglish:
      "This is the share of the last 13 weeks in which an engineer had at least one merged PR or one submitted review, so steady contribution outranks one short burst.",
    signals: [
      "Every active week contributes to the score.",
      "Merged PRs and submitted reviews both count as activity.",
      "The score is already on a 0 to 100 scale, so it is not normalized.",
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function getOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

function normalizeScore(score: unknown): DimensionScore | undefined {
  if (!isRecord(score)) {
    return undefined;
  }

  const normalized: DimensionScore = {
    raw: getOptionalNumber(score.raw),
    score: getOptionalNumber(score.score),
    weighted_contribution:
      getOptionalNumber(score.weighted_contribution) ??
      getOptionalNumber(score.contribution),
    rank: getOptionalNumber(score.rank),
  };

  return Object.values(normalized).some((value) => value !== undefined)
    ? normalized
    : undefined;
}

function mergeEngineers(
  engineer: ImpactEngineer,
  fallback?: ImpactEngineer,
): ImpactEngineer {
  if (!fallback) {
    return engineer;
  }

  return {
    ...fallback,
    ...engineer,
    shipping: engineer.shipping ?? fallback.shipping,
    enablement: engineer.enablement ?? fallback.enablement,
    complexity: engineer.complexity ?? fallback.complexity,
    consistency: engineer.consistency ?? fallback.consistency,
    stats: engineer.stats ?? fallback.stats,
    why_it_matters: engineer.why_it_matters ?? fallback.why_it_matters,
  };
}

function normalizeEngineer(candidate: unknown): ImpactEngineer | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const identity = isRecord(candidate.identity) ? candidate.identity : candidate;
  const ranking = isRecord(candidate.ranking) ? candidate.ranking : candidate;
  const scores = isRecord(candidate.scores) ? candidate.scores : candidate;
  const login = getOptionalString(identity.login) ?? getOptionalString(candidate.login);

  if (!login) {
    return null;
  }

  return {
    login,
    display_name:
      getOptionalString(identity.display_name) ??
      getOptionalString(candidate.display_name),
    avatar_url:
      getOptionalString(identity.avatar_url) ??
      getOptionalString(candidate.avatar_url),
    profile_url:
      getOptionalString(identity.profile_url) ??
      getOptionalString(candidate.profile_url),
    rank:
      getOptionalNumber(ranking.rank) ??
      getOptionalNumber(candidate.rank) ??
      getOptionalNumber(candidate.impact_rank),
    impact_score:
      getOptionalNumber(ranking.impact_score) ??
      getOptionalNumber(candidate.impact_score),
    why_it_matters: getOptionalStringArray(candidate.why_it_matters),
    shipping: normalizeScore(scores.shipping),
    enablement: normalizeScore(scores.enablement),
    complexity: normalizeScore(scores.complexity),
    consistency: normalizeScore(scores.consistency),
    stats: isRecord(candidate.stats) ? (candidate.stats as EngineerStats) : undefined,
  };
}

function normalizeLeaderboardEntry(
  candidate: unknown,
  key: DimensionKey,
  contributors: Map<string, ImpactEngineer>,
): ImpactEngineer | null {
  const engineer = normalizeEngineer(candidate);
  if (!engineer) {
    return null;
  }

  const rawCandidate = candidate as Record<string, unknown>;
  const normalized = {
    ...engineer,
    rank: engineer.rank ?? getOptionalNumber(rawCandidate.impact_rank),
    impact_score:
      engineer.impact_score ?? getOptionalNumber(rawCandidate.impact_score),
  };
  const explicitScore = normalizeScore({
    raw: rawCandidate.dimension_raw,
    score: rawCandidate.dimension_score,
  });

  if (!explicitScore) {
    return mergeEngineers(normalized, contributors.get(engineer.login));
  }

  return mergeEngineers(
    {
      ...normalized,
      [key]: {
        ...contributors.get(engineer.login)?.[key],
        ...normalized[key],
        ...explicitScore,
      },
    },
    contributors.get(engineer.login),
  );
}

export function normalizeDataset(dataset: unknown): EngineerImpactDataset {
  if (!isRecord(dataset)) {
    return {};
  }

  const contributors = Array.isArray(dataset.contributors)
    ? dataset.contributors
        .map((engineer) => normalizeEngineer(engineer))
        .filter((engineer): engineer is ImpactEngineer => engineer !== null)
    : undefined;
  const contributorMap = new Map(
    (contributors ?? []).map((engineer) => [engineer.login, engineer]),
  );
  const leaders = Array.isArray(dataset.leaders)
    ? dataset.leaders
        .map((engineer) => normalizeEngineer(engineer))
        .filter((engineer): engineer is ImpactEngineer => engineer !== null)
        .map((engineer) => mergeEngineers(engineer, contributorMap.get(engineer.login)))
    : undefined;
  const rawLeaderboards = isRecord(dataset.leaderboards)
    ? (dataset.leaderboards as Partial<Record<DimensionKey, unknown>>)
    : undefined;
  const leaderboards = rawLeaderboards
    ? DIMENSION_ORDER.reduce<Partial<Record<DimensionKey, ImpactEngineer[]>>>(
        (accumulator, key) => {
          const entries = rawLeaderboards[key];
          if (!Array.isArray(entries)) {
            return accumulator;
          }

          const normalizedEntries = entries
            .map((engineer) =>
              normalizeLeaderboardEntry(engineer, key, contributorMap),
            )
            .filter((engineer): engineer is ImpactEngineer => engineer !== null);

          if (normalizedEntries.length > 0) {
            accumulator[key] = normalizedEntries;
          }

          return accumulator;
        },
        {},
      )
    : undefined;
  const methodology = isRecord(dataset.methodology)
    ? {
        weights: isRecord(dataset.methodology.weights)
          ? {
              shipping: getOptionalNumber(dataset.methodology.weights.shipping),
              enablement: getOptionalNumber(dataset.methodology.weights.enablement),
              complexity: getOptionalNumber(dataset.methodology.weights.complexity),
              consistency: getOptionalNumber(dataset.methodology.weights.consistency),
            }
          : undefined,
        dimension_formulas: isRecord(dataset.methodology.dimension_formulas)
          ? {
              shipping: getOptionalString(
                dataset.methodology.dimension_formulas.shipping,
              ),
              enablement: getOptionalString(
                dataset.methodology.dimension_formulas.enablement,
              ),
              complexity: getOptionalString(
                dataset.methodology.dimension_formulas.complexity,
              ),
              consistency: getOptionalString(
                dataset.methodology.dimension_formulas.consistency,
              ),
            }
          : undefined,
        inclusion_rule: getOptionalString(dataset.methodology.inclusion_rule),
        tie_breaker: getOptionalString(dataset.methodology.tie_breaker),
      }
    : undefined;

  return {
    generated_at: getOptionalString(dataset.generated_at),
    repo: getOptionalString(dataset.repo),
    window_days: getOptionalNumber(dataset.window_days),
    window_start:
      typeof dataset.window_start === "string" || dataset.window_start === null
        ? dataset.window_start
        : undefined,
    window_end:
      typeof dataset.window_end === "string" || dataset.window_end === null
        ? dataset.window_end
        : undefined,
    methodology,
    leaders,
    leaderboards,
    contributors,
  };
}

export function validateDataset(dataset: unknown): string | null {
  if (!dataset || typeof dataset !== "object") {
    return "The static dataset could not be parsed.";
  }

  const candidate = dataset as EngineerImpactDataset;

  if (
    candidate.leaders &&
    !Array.isArray(candidate.leaders)
  ) {
    return "The leaders payload is not an array.";
  }

  if (
    candidate.contributors &&
    !Array.isArray(candidate.contributors)
  ) {
    return "The contributors payload is not an array.";
  }

  return null;
}

export function getWeights(dataset: EngineerImpactDataset): DimensionWeights {
  return {
    ...DEFAULT_WEIGHTS,
    ...dataset.methodology?.weights,
  };
}

export function getDimensionScore(
  engineer: ImpactEngineer,
  key: DimensionKey,
): DimensionScore {
  return engineer[key] ?? {};
}

export function getStats(engineer: ImpactEngineer): EngineerStats {
  return engineer.stats ?? {};
}

export function getDisplayName(engineer: ImpactEngineer) {
  return engineer.display_name?.trim() || engineer.login?.trim() || "Unknown engineer";
}

export function getInitials(engineer: ImpactEngineer) {
  const name = getDisplayName(engineer).trim();
  if (!name) {
    return "?";
  }

  const parts = name.split(/\s+/).slice(0, 2);
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function getImpactScore(engineer: ImpactEngineer) {
  return engineer.impact_score ?? 0;
}

export function getWeightedContribution(
  engineer: ImpactEngineer,
  key: DimensionKey,
  weights: DimensionWeights,
) {
  const metric = getDimensionScore(engineer, key);
  if (metric.weighted_contribution !== undefined) {
    return metric.weighted_contribution;
  }

  return (metric.score ?? 0) * weights[key];
}

function compareEngineers(
  left: ImpactEngineer,
  right: ImpactEngineer,
  fallbackKey?: DimensionKey,
) {
  const impactDelta = getImpactScore(right) - getImpactScore(left);
  if (impactDelta !== 0) {
    return impactDelta;
  }

  if (fallbackKey) {
    const dimensionDelta =
      (getDimensionScore(right, fallbackKey).score ?? 0) -
      (getDimensionScore(left, fallbackKey).score ?? 0);
    if (dimensionDelta !== 0) {
      return dimensionDelta;
    }
  }

  return left.login.localeCompare(right.login);
}

export function resolveLeaders(dataset: EngineerImpactDataset) {
  const contributors = dataset.contributors ?? [];
  const leaders =
    dataset.leaders && dataset.leaders.length > 0
      ? dataset.leaders
      : [...contributors].sort((left, right) => compareEngineers(left, right));

  return leaders.slice(0, 5);
}

export function resolveLeaderboard(
  dataset: EngineerImpactDataset,
  key: DimensionKey,
) {
  const explicit = dataset.leaderboards?.[key];
  if (explicit && explicit.length > 0) {
    return explicit.slice(0, 5);
  }

  return [...(dataset.contributors ?? [])]
    .sort((left, right) => compareEngineers(left, right, key))
    .slice(0, 5);
}

export function deriveInsights(engineer: ImpactEngineer): string[] {
  if (engineer.why_it_matters && engineer.why_it_matters.length > 0) {
    return engineer.why_it_matters.slice(0, 3);
  }

  const stats = getStats(engineer);
  const insights: string[] = [];

  if (stats.merged_prs) {
    insights.push(
      `Merged ${stats.merged_prs} PR${stats.merged_prs === 1 ? "" : "s"} in the measured window.`,
    );
  }

  if (stats.reviews_given) {
    insights.push(
      `Completed ${stats.reviews_given} review${stats.reviews_given === 1 ? "" : "s"} to unblock teammates.`,
    );
  }

  if (stats.active_weeks) {
    insights.push(`Active in ${stats.active_weeks} of the last 13 weeks.`);
  }

  if (
    insights.length === 0 &&
    getImpactScore(engineer) > 0
  ) {
    insights.push("Composite score is available, but the supporting explanation was not provided.");
  }

  return insights.slice(0, 3);
}

export function getLeaderboardDetail(
  engineer: ImpactEngineer,
  key: DimensionKey,
) {
  const stats = getStats(engineer);

  switch (key) {
    case "shipping":
      return `${stats.merged_prs ?? 0} PRs merged`;
    case "enablement":
      return `${stats.reviews_given ?? 0} reviews`;
    case "complexity":
      return `${stats.avg_discussion_comments_per_pr?.toFixed(1) ?? "0.0"} comments/PR`;
    case "consistency":
      return `${stats.active_weeks ?? 0} active weeks`;
    default:
      return "";
  }
}
