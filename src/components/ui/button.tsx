import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function Button({ children, className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-ink/10 bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 dark:border-white/10 dark:bg-[#1d1f1e] dark:text-[#f3efe6] dark:hover:border-white/20",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
