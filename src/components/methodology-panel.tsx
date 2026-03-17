import { Card } from "./ui/card";
import { DIMENSION_META, DIMENSION_ORDER, getWeights } from "../lib/engineers";
import { formatNumber } from "../lib/format";
import type { EngineerImpactDataset } from "../types/engineers";

interface MethodologyPanelProps {
  dataset: EngineerImpactDataset;
}

export function MethodologyPanel({ dataset }: MethodologyPanelProps) {
  const weights = getWeights(dataset);

  return (
    <Card className="border-white/70 bg-gradient-to-br from-[#fffaf2] via-[#fffdf9] to-[#f0f7f5] p-6 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(22,25,24,0.96),rgba(15,18,17,0.94))]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/50 dark:text-white/50">
            Methodology
          </div>
          <h2 className="mt-2 text-3xl font-display font-bold text-ink dark:text-[#f3efe6]">
            Transparent scoring, not a magic leaderboard
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/65 dark:text-white/65">
            Impact combines product delivery, team enablement, problem complexity, and week-to-week consistency.
            Shipping, enablement, and complexity are normalized from raw GitHub activity, while consistency stays
            direct as the share of active weeks across the 90-day window.
          </p>
        </div>

        <div className="rounded-[24px] border border-ink/8 bg-white/80 p-5 dark:border-white/10 dark:bg-[#101413]">
          <div className="text-xs uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">Rules</div>
          <div className="mt-3 space-y-3 text-sm leading-6 text-ink/70 dark:text-white/70">
            <p>{dataset.methodology?.inclusion_rule ?? "Contributor must have at least 1 merged PR or 3 reviews."}</p>
            <p>{dataset.methodology?.tie_breaker ?? "Ties break by impact score, shipping score, then login."}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        {DIMENSION_ORDER.map((key) => (
          <div
            key={key}
            className="rounded-[24px] border border-ink/8 bg-white/80 p-5 dark:border-white/10 dark:bg-[#101413]"
          >
            <div className={`text-sm font-semibold uppercase tracking-[0.18em] ${DIMENSION_META[key].accent}`}>
              {DIMENSION_META[key].shortLabel}
            </div>
            <div className="mt-2 text-2xl font-display font-bold text-ink dark:text-[#f3efe6]">
              {formatNumber(weights[key] * 100)}%
            </div>
            <p className="mt-3 text-sm leading-6 text-ink/60 dark:text-white/60">{DIMENSION_META[key].description}</p>
            <p className="mt-3 text-sm leading-6 text-ink/75 dark:text-white/75">
              {DIMENSION_META[key].plainEnglish}
            </p>
            <div className="mt-4 rounded-2xl bg-ink/[0.04] p-3 font-mono text-xs leading-6 text-ink/70 dark:bg-[#0b0f0e] dark:text-white/70">
              {dataset.methodology?.dimension_formulas?.[key] ?? "Formula will be provided by the scoring pipeline."}
            </div>
            <div className="mt-4 space-y-2">
              {DIMENSION_META[key].signals.map((signal) => (
                <div
                  key={signal}
                  className="flex gap-3 text-sm leading-6 text-ink/62 dark:text-white/62"
                >
                  <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${DIMENSION_META[key].color}`} />
                  <span>{signal}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
