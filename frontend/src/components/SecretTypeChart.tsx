import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Finding } from "../lib/types";

const PALETTE = [
  "#7aa2f7",
  "#bb9af7",
  "#7dcfff",
  "#9ece6a",
  "#ff9e64",
  "#f7768e",
  "#e0af68",
  "#73daca",
  "#b4f9f8",
  "#c0caf5",
];

interface DataPoint {
  name: string;
  value: number;
}

function buildTypeData(findings: Finding[]): DataPoint[] {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.secret_type] = (counts[f.secret_type] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function SecretTypeChart({ findings }: { findings: Finding[] }) {
  const data = buildTypeData(findings);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-tokyo-comment text-sm">
        No findings
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          outerRadius="65%"
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#24283b",
            border: "1px solid #3b4261",
            borderRadius: 6,
            color: "#c0caf5",
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#c0caf5" }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
