"use client";

/** Small presentational blocks shared by the report tabs (client-safe, no data fetching). */
import type { LucideIcon } from "lucide-react";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3" data-testid="report-kpis">
      {children}
    </div>
  );
}

export function Kpi({
  title,
  value,
  icon: Icon,
  hint,
  unit,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  hint?: string;
  unit?: string;
}) {
  const f = useFormatter();
  return (
    <div className="rounded-xl border border-border bg-card p-3" data-testid="report-kpi">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-md bg-primary/10 p-1.5">
          <Icon className="size-3.5 text-primary" aria-hidden="true" />
        </span>
        <span className="truncate text-xs text-muted-foreground" title={title}>
          {title}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums lg:text-2xl" dir="ltr">
        {typeof value === "number" ? f.number(value) : value}
        {unit && <span className="ms-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ChartCard({
  title,
  children,
  className,
  height = "h-56",
  testId,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  height?: string;
  testId?: string;
}) {
  return (
    <Card className={cn("gap-0 rounded-xl py-0", className)} data-testid={testId ?? "report-chart"}>
      <CardHeader className="px-3 pt-3 pb-1">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <div className={cn(height, "w-full")} role="img" aria-label={title}>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{children}</div>;
}

export function ScopeNote({ text }: { text: string }) {
  return (
    <p
      className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
      data-testid="report-scope"
    >
      {text}
    </p>
  );
}
