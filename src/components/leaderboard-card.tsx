import { Card } from "./ui/card";
import {
  DIMENSION_META,
  getDimensionScore,
  getDisplayName,
  getInitials,
  getLeaderboardDetail,
} from "../lib/engineers";
import { cn } from "../lib/cn";
import { formatScore } from "../lib/format";
import type { DimensionKey, ImpactEngineer } from "../types/engineers";

interface LeaderboardCardProps {
  dimension: DimensionKey;
  engineers: ImpactEngineer[];
}

export function LeaderboardCard({ dimension, engineers }: LeaderboardCardProps) {
  const meta = DIMENSION_META[dimension];

  return (
    <Card className="h-full border-white/70 bg-gradient-to-br from-white/90 to-[#f5ede4] p-5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(26,28,27,0.95),rgba(18,20,20,0.9))]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={cn("text-sm font-semibold uppercase tracking-[0.18em]", meta.accent)}>
            {meta.shortLabel}
          </div>
          <h3 className="mt-2 text-xl font-display font-bold text-ink dark:text-[#f3efe6]">{meta.label}</h3>
          <p className="mt-2 text-sm leading-6 text-ink/60 dark:text-white/60">{meta.description}</p>
        </div>
        <div className={cn("h-3 w-3 rounded-full", meta.color)} />
      </div>

      <div className="mt-5 space-y-3">
        {engineers.length > 0 ? (
          engineers.map((engineer, index) => (
            <div
              key={`${dimension}-${engineer.login}`}
              className="flex items-center gap-3 rounded-2xl border border-ink/8 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-[#101413]"
            >
              <div className="w-7 text-sm font-semibold text-ink/50 dark:text-white/50">{index + 1}</div>
              {engineer.avatar_url ? (
                <img
                  src={engineer.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-xl border border-ink/8 object-cover dark:border-white/10"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/5 text-sm font-semibold text-ink/70 dark:bg-white/5 dark:text-white/75">
                  {getInitials(engineer)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink dark:text-[#f3efe6]">
                  {getDisplayName(engineer)}
                </div>
                <div className="truncate text-xs text-ink/50 dark:text-white/50">
                  {getLeaderboardDetail(engineer, dimension)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-display font-bold text-ink dark:text-[#f3efe6]">
                  {formatScore(getDimensionScore(engineer, dimension).score)}
                </div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink/40 dark:text-white/40">score</div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-ink/10 bg-ink/[0.03] px-4 py-8 text-sm text-ink/55 dark:border-white/10 dark:bg-[#101413] dark:text-white/55">
            No qualified contributors yet.
          </div>
        )}
      </div>
    </Card>
  );
}
