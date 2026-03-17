interface StatChipProps {
  label: string;
  value: string;
}

export function StatChip({ label, value }: StatChipProps) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-[#101413]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink dark:text-[#f3efe6]">{value}</div>
    </div>
  );
}
