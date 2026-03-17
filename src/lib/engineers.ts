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
  return engineer.display_name || engineer.login;
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
