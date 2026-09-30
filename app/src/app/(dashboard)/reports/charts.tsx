"use client";

/**
 * Report charts (FR-RPT-006) — Recharts on Omnitrix tokens. Every chart is wrapped in a fixed-height box by the
 * caller and rendered with `ResponsiveContainer`, so it adapts from 390px to desktop. Numbers/dates come from
 * `useFormatter()` (never `Intl.*(undefined)` — hydration, AGENTS #13). Animations are off (deterministic e2e).
 */
import { useFormatter } from "next-intl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthPoint, NamedCount } from "@/features/reports/queries";

const PALETTE = [
  "var(--primary)",
  "var(--chart-2, #34d399)",
  "var(--chart-3, #60a5fa)",
  "var(--chart-4, #f59e0b)",
  "var(--chart-5, #a78bfa)",
  "var(--chart-6, #f472b6)",
  "var(--muted-foreground)",
];

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)" },
  itemStyle: { color: "var(--primary)" },
} as const;

/** New-per-month area (trailing 6 months). */
export function MonthlyArea({ data, label, id }: { data: MonthPoint[]; label: string; id: string }) {
  const f = useFormatter();
  const rows = data.map((d) => ({ ...d, label: f.dateTime(new Date(d.month), { month: "short" }) }));
  const gid = `rep-${id}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          reversed
        />
        <YAxis
          allowDecimals={false}
          width={28}
          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          orientation="right"
        />
        <Tooltip {...tooltipStyle} formatter={(v) => [f.number(Number(v)), label]} />
        <Area
          type="monotone"
          dataKey="count"
          name={label}
          stroke="var(--primary)"
          strokeWidth={2}
          fill={`url(#${gid})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for "count per X" lists (roles, departments, courses…). */
export function CountBars({ data, label }: { data: NamedCount[]; label: string }) {
  const f = useFormatter();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
        barCategoryGap={6}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={110}
          orientation="right"
          tick={{ fill: "var(--foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: "var(--accent)" }}
          formatter={(v) => [f.number(Number(v)), label]}
        />
        <Bar dataKey="count" name={label} radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut with a legend below (status / category breakdowns). Zero slices are dropped from the ring, kept in the legend. */
export function Donut({ data, label }: { data: NamedCount[]; label: string }) {
  const f = useFormatter();
  const total = data.reduce((a, d) => a + d.count, 0);
  const slices = data.filter((d) => d.count > 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {total === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">—</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="label"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={2}
                stroke="var(--card)"
                isAnimationActive={false}
              >
                {slices.map((d) => (
                  <Cell key={d.id} fill={PALETTE[data.indexOf(d) % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={(v) => [f.number(Number(v)), label]} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]" aria-label={label}>
        {data.map((d, i) => (
          <li key={d.id} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
              aria-hidden
            />
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="ms-auto font-semibold tabular-nums" dir="ltr">
              {f.number(d.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
