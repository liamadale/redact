import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Finding } from "../lib/types";

const SEVERITY_COLORS = {
  critical: "#f7768e",
  high: "#ff9e64",
  medium: "#e0af68",
  low: "#565f89",
};

interface DataPoint {
  month: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function buildTimelineData(findings: Finding[]): DataPoint[] {
  const buckets: Record<string, DataPoint> = {};
  for (const f of findings) {
    if (!f.commit_date) continue;
    const month = f.commit_date.slice(0, 7);
    if (!buckets[month]) {
      buckets[month] = { month, critical: 0, high: 0, medium: 0, low: 0 };
    }
    buckets[month][f.severity]++;
  }
  return Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month));
}

export function TimelineChart({ findings }: { findings: Finding[] }) {
  const data = buildTimelineData(findings);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-tokyo-comment text-sm">
        No commit date data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {(["critical", "high", "medium", "low"] as const).map((s) => (
            <linearGradient key={s} id={`grad-${s}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SEVERITY_COLORS[s]} stopOpacity={0.4} />
              <stop offset="95%" stopColor={SEVERITY_COLORS[s]} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#3b4261" />
        <XAxis
          dataKey="month"
          tick={{ fill: "#565f89", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#3b4261" }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "#565f89", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#24283b",
            border: "1px solid #3b4261",
            borderRadius: 6,
            color: "#c0caf5",
            fontSize: 12,
          }}
        />
        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <Area
            key={s}
            type="monotone"
            dataKey={s}
            stackId="1"
            stroke={SEVERITY_COLORS[s]}
            fill={`url(#grad-${s})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
