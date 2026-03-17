import { Card } from "./ui/card";
import { ScoreSegmentBar } from "./score-segment-bar";
import { StatChip } from "./stat-chip";
import {
  getDisplayName,
  getInitials,
  getStats,
} from "../lib/engineers";
import { formatHours, formatNumber, formatScore } from "../lib/format";
import type { DimensionWeights, ImpactEngineer } from "../types/engineers";

interface EngineerCardProps {
  engineer: ImpactEngineer;
  rank: number;
  weights: DimensionWeights;
}

export function EngineerCard({ engineer, rank, weights }: EngineerCardProps) {
  const stats = getStats(engineer);

  return (
    <Card className="overflow-hidden border-white/70 bg-gradient-to-br from-surface via-surface to-[#f3eadf] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(25,27,26,0.96),rgba(18,19,19,0.92))]">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)] lg:p-6">
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-lg font-bold text-canvas dark:bg-[#f3efe6] dark:text-[#141615]">
              #{rank}
            </div>

            {engineer.avatar_url ? (
              <img
                src={engineer.avatar_url}
                alt={`${getDisplayName(engineer)} avatar`}
                className="h-14 w-14 rounded-2xl border border-ink/10 object-cover dark:border-white/10"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-ink/10 bg-ink/5 font-semibold text-ink/70 dark:border-white/10 dark:bg-white/5 dark:text-white/75">
                {getInitials(engineer)}
              </div>
            )}

            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">Impact Rank</div>
              <div className="mt-1 text-2xl font-bold font-display text-ink dark:text-[#f3efe6]">
                {engineer.profile_url ? (
                  <a
                    className="transition hover:text-shipping dark:hover:text-[#ff9a69]"
                    href={engineer.profile_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {getDisplayName(engineer)}
                  </a>
                ) : (
                  getDisplayName(engineer)
                )}
              </div>
              <div className="mt-1 text-sm text-ink/55 dark:text-white/55">@{engineer.login}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatChip
              label="Merged PRs"
              value={formatNumber(stats.merged_prs)}
            />
            <StatChip
              label="Reviews"
              value={formatNumber(stats.reviews_given)}
            />
            <StatChip
              label="Issues Closed"
              value={formatNumber(stats.issues_closed)}
            />
            <StatChip
              label="Median Response"
              value={formatHours(stats.median_response_hours)}
            />
          </div>
        </div>

        <div className="space-y-5 rounded-[24px] border border-ink/8 bg-white/70 p-5 dark:border-white/10 dark:bg-[#101413]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">Composite impact score</div>
              <div className="mt-2 text-4xl font-bold font-display text-ink dark:text-[#f3efe6]">
                {formatScore(engineer.impact_score)}
              </div>
            </div>
            <div className="rounded-full bg-ink px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-canvas dark:bg-[#f3efe6] dark:text-[#141615]">
              Weighted
            </div>
          </div>

          <ScoreSegmentBar engineer={engineer} weights={weights} />
        </div>
      </div>
    </Card>
  );
}
