/**
 * MiniStatCard — dense mobile statistic (ADR-0007 §2). 3-column grid, icon 12px, 10px label, 16px value, optional
 * trend badge. Server-renderable (no client hooks). Use `StatCard` on lg+.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  /** Tailwind text colour for the icon (defaults to primary). */
  tone?: string;
  className?: string;
};

export function MiniStatCard({ title, value, icon: Icon, trend, tone = "text-primary", className }: Props) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-2", className)} data-testid="mini-stat">
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="rounded-md bg-primary/10 p-1">
          <Icon className={cn("size-3", tone)} aria-hidden="true" />
        </span>
        <span className="truncate text-[10px] text-muted-foreground" title={title}>
          {title}
        </span>
        {trend && (
          <span
            className={cn(
              "ms-auto text-[9px] font-semibold tabular-nums",
              trend.isPositive ? "text-primary" : "text-destructive",
            )}
            dir="ltr"
          >
            {trend.isPositive ? "+" : "−"}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <p className="text-center text-base font-bold tabular-nums" dir="ltr">
        {value}
      </p>
    </div>
  );
}
