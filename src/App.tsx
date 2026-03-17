import { useEffect, useState } from "react";
import engineersData from "../data/engineers.json";
import { EmptyState } from "./components/empty-state";
import { EngineerCard } from "./components/engineer-card";
import { LeaderboardCard } from "./components/leaderboard-card";
import { MethodologyPanel } from "./components/methodology-panel";
import { ThemeSwitch } from "./components/theme-switch";
import { Card } from "./components/ui/card";
import {
  DIMENSION_ORDER,
  getWeights,
  normalizeDataset,
  resolveLeaderboard,
  resolveLeaders,
  validateDataset,
} from "./lib/engineers";
import { formatShortDate, formatTimestamp } from "./lib/format";
import type { EngineerImpactDataset } from "./types/engineers";

const dataset = normalizeDataset(engineersData);
const THEME_STORAGE_KEY = "engineer-impact-theme";

type Theme = "light" | "dark";

function buildWindowLabel(data: EngineerImpactDataset) {
  const start = formatShortDate(data.window_start);
  const end = formatShortDate(data.window_end);

  if (start && end) {
    return `${start} - ${end}`;
  }

  if (data.window_days) {
    return `Last ${data.window_days} days`;
  }

  return "Impact window unavailable";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const datasetError = validateDataset(dataset);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  if (datasetError) {
    return (
      <main className="min-h-screen bg-canvas px-6 py-10 text-ink dark:bg-[#101211] dark:text-[#f3efe6]">
        <div className="mx-auto max-w-7xl">
          <EmptyState
            title="The engineer impact dataset is malformed"
            description={datasetError}
          />
        </div>
      </main>
    );
  }

  const weights = getWeights(dataset);
  const leaders = resolveLeaders(dataset);
  const generatedLabel = formatTimestamp(dataset.generated_at);

  return (
    <main className="min-h-screen bg-canvas px-4 py-5 text-ink transition-colors dark:bg-[#101211] dark:text-[#f3efe6] sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(230,126,79,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(23,143,132,0.14),transparent_35%),linear-gradient(180deg,#f9f3ec_0%,#f6f0e8_45%,#f2eadf_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(230,126,79,0.14),transparent_26%),radial-gradient(circle_at_top_right,rgba(23,143,132,0.12),transparent_30%),linear-gradient(180deg,#151817_0%,#101211_55%,#0d0f0f_100%)]" />

      <div className="mx-auto flex max-w-[1380px] flex-col gap-5">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(255,250,244,0.92))] p-5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(22,24,23,0.96),rgba(18,19,19,0.92))] lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">
                {dataset.repo ?? "GitHub Repository"}
              </div>
              <h1 className="mt-2 text-3xl font-display font-bold tracking-tight text-ink dark:text-[#f3efe6] sm:text-[2.65rem]">
                Engineer impact, made defensible.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-ink/68 dark:text-white/68">
                A precomputed view of who created the most leverage in the last quarter, with visible supporting signals.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-ink/8 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-[#101413]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45 dark:text-white/45">Window</div>
                <div className="mt-1 text-sm font-semibold text-ink dark:text-[#f3efe6]">{buildWindowLabel(dataset)}</div>
              </div>
              <div className="rounded-[22px] border border-ink/8 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-[#101413]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45 dark:text-white/45">Generated</div>
                <div className="mt-1 text-sm font-semibold text-ink dark:text-[#f3efe6]">{generatedLabel}</div>
              </div>
              <div className="rounded-[22px] border border-ink/8 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-[#101413]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45 dark:text-white/45">Theme</div>
                <div className="mt-2">
                  <ThemeSwitch theme={theme} onChange={setTheme} />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {leaders.length > 0 ? (
          <>
            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">
                    Top 5 most impactful engineers
                  </div>
                  <h2 className="mt-2 text-[2rem] font-display font-bold text-ink dark:text-[#f3efe6]">
                    Ranked cards built for a 10-second scan
                  </h2>
                </div>
                <div className="text-sm text-ink/55 dark:text-white/55">
                  Composite score = shipping + enablement + complexity + consistency
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {leaders.map((engineer, index) => (
                  <EngineerCard
                    key={engineer.login}
                    engineer={engineer}
                    rank={engineer.rank ?? index + 1}
                    weights={weights}
                  />
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
              {DIMENSION_ORDER.map((dimension) => (
                <LeaderboardCard
                  key={dimension}
                  dimension={dimension}
                  engineers={resolveLeaderboard(dataset, dimension)}
                />
              ))}
            </section>
          </>
        ) : (
          <EmptyState
            title="No ranked engineers yet"
            description="`data/engineers.json` is present, but it does not include any qualified contributors yet. Once the scoring pipeline writes leaders or contributors into the dataset, this dashboard will render the ranked cards and dimension leaderboards automatically."
          />
        )}

        <MethodologyPanel dataset={dataset} />
      </div>
    </main>
  );
}
