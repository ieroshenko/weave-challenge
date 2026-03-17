import { Card } from "./ui/card";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-line bg-surface/80 px-6 py-12 text-center dark:border-white/10 dark:bg-[#171817]">
      <div className="mx-auto max-w-2xl">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 dark:text-white/45">Data unavailable</div>
        <h2 className="mt-3 text-3xl font-display font-bold text-ink dark:text-[#f3efe6]">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-ink/65 dark:text-white/65">{description}</p>
      </div>
    </Card>
  );
}
