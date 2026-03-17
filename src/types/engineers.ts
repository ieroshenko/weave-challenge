export type DimensionKey =
  | "shipping"
  | "enablement"
  | "complexity"
  | "consistency";

export type DimensionWeights = Record<DimensionKey, number>;

export interface DimensionScore {
  raw?: number;
  score?: number;
  weighted_contribution?: number;
  rank?: number;
}

export interface EngineerStats {
  merged_prs?: number;
  issues_closed?: number;
  total_additions?: number;
  total_deletions?: number;
  code_reduction_bonus?: number;
  reviews_given?: number;
  avg_comments_per_review?: number;
  median_response_hours?: number | null;
  avg_discussion_comments_per_pr?: number;
  total_issue_age_days?: number;
  active_weeks?: number;
}

export interface ImpactEngineer {
  login: string;
  display_name?: string;
  avatar_url?: string;
  profile_url?: string;
  rank?: number;
  impact_score?: number;
  why_it_matters?: string[];
  shipping?: DimensionScore;
  enablement?: DimensionScore;
  complexity?: DimensionScore;
  consistency?: DimensionScore;
  stats?: EngineerStats;
}

export interface EngineerImpactDataset {
  generated_at?: string;
  repo?: string;
  window_days?: number;
  window_start?: string | null;
  window_end?: string | null;
  methodology?: {
    weights?: Partial<DimensionWeights>;
    dimension_formulas?: Partial<Record<DimensionKey, string>>;
    inclusion_rule?: string;
    tie_breaker?: string;
  };
  leaders?: ImpactEngineer[];
  leaderboards?: Partial<Record<DimensionKey, ImpactEngineer[]>>;
  contributors?: ImpactEngineer[];
}
