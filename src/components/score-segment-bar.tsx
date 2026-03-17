import { DIMENSION_META, DIMENSION_ORDER, getWeightedContribution } from "../lib/engineers";
import { cn } from "../lib/cn";
import { formatScore } from "../lib/format";
import type { DimensionWeights, ImpactEngineer } from "../types/engineers";

interface ScoreSegmentBarProps {
  engineer: ImpactEngineer;
  weights: DimensionWeights;
}

export function ScoreSegmentBar({ engineer, weights }: ScoreSegmentBarProps) {
  const total = Math.max(
    DIMENSION_ORDER.reduce(
      (sum, key) => sum + getWeightedContribution(engineer, key, weights),
      0,
    ),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-ink/8">
        {DIMENSION_ORDER.map((key) => {
          const contribution = getWeightedContribution(engineer, key, weights);
          const width = total > 0 ? (contribution / total) * 100 : weights[key] * 100;

          return (
            <div
              key={key}
              className={cn("h-full", DIMENSION_META[key].color)}
              style={{ width: `${Math.max(width, 8)}%` }}
              title={`${DIMENSION_META[key].label}: ${formatScore(contribution)}`}
            />
          );
        })}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {DIMENSION_ORDER.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-2xl bg-ink/[0.03] px-3 py-2 text-xs text-ink/70 dark:bg-[#101413] dark:text-white/65"
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", DIMENSION_META[key].color)} />
              <span>{DIMENSION_META[key].shortLabel}</span>
            </div>
            <span className="font-semibold text-ink dark:text-[#f3efe6]">
              {formatScore(engineer[key]?.score)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
