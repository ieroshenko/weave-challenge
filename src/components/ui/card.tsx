import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-line/80 bg-surface/95 shadow-panel backdrop-blur-sm dark:border-white/10 dark:bg-[#171817]/92 dark:shadow-[0_20px_70px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
