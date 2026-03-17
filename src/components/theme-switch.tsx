import { cn } from "../lib/cn";

type Theme = "light" | "dark";

interface ThemeSwitchProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeSwitch({ theme, onChange }: ThemeSwitchProps) {
  return (
    <div className="inline-flex rounded-full border border-ink/10 bg-white/70 p-1 dark:border-white/10 dark:bg-[#101413]">
      {(["light", "dark"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition",
            theme === option
              ? "bg-ink text-canvas dark:bg-[#f3efe6] dark:text-[#141615]"
              : "text-ink/55 hover:text-ink dark:text-white/55 dark:hover:text-white",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
