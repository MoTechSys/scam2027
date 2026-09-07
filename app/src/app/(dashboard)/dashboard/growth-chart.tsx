"use client";

/**
 * "System growth" — new users per month (ADR-0007 §3). Real data from `loadUserGrowth`; the neon gradient area
 * mirrors the reference design. Height is fixed by the parent (80px on mobile, 240px on desktop).
 */
import { useFormatter } from "next-intl";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type GrowthPoint = { month: string; users: number };

export function GrowthChart({ data, compact = false }: { data: GrowthPoint[]; compact?: boolean }) {
  const f = useFormatter();
  const rows = data.map((d) => ({
    ...d,
    label: f.dateTime(new Date(d.month), { month: compact ? "short" : "long" }),
  }));
  const gradientId = compact ? "growth-m" : "growth-d";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, "dataMax + 1"]} />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--muted-foreground)", fontSize: compact ? 9 : 11 }}
          axisLine={false}
          tickLine={false}
          interval={compact ? 1 : 0}
          reversed
        />
        {!compact && (
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--foreground)" }}
            itemStyle={{ color: "var(--primary)" }}
          />
        )}
        <Area
          type="monotone"
          dataKey="users"
          stroke="var(--primary)"
          strokeWidth={compact ? 1.5 : 2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
