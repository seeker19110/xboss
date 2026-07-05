"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import EmptyState from "@/app/components/EmptyState";
import { Users } from "lucide-react";

type ManpowerRow = { date: string; crew: string; headcount: number };

const PALETTE = [
  "var(--color-sky-500)",
  "var(--color-emerald-500)",
  "var(--color-amber-500)",
  "var(--color-violet-500)",
  "var(--color-rose-500)",
  "var(--color-zinc-500)",
];

export default function ManpowerChart({ manpower }: { manpower: ManpowerRow[] }) {
  if (manpower.length === 0)
    return <EmptyState icon={Users} message="Chưa có dữ liệu nhân lực trong tháng này" />;

  const crews = Array.from(new Set(manpower.map((m) => m.crew))).sort();
  const byDate = new Map<string, Record<string, number>>();
  for (const m of manpower) {
    const row = byDate.get(m.date) ?? {};
    row[m.crew] = (row[m.crew] ?? 0) + m.headcount;
    byDate.set(m.date, row);
  }
  const data = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({ date: date.slice(8, 10), ...row }));

  const totalByCrew = crews.map((crew) => ({
    crew,
    total: manpower.filter((m) => m.crew === crew).reduce((s, m) => s + m.headcount, 0),
  }));

  return (
    <div className="space-y-4">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
            <XAxis
              dataKey="date"
              stroke="var(--color-zinc-600)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis stroke="var(--color-zinc-600)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "var(--color-zinc-800)" }}
              contentStyle={{
                background: "var(--color-zinc-900)",
                border: "1px solid var(--color-zinc-700)",
                borderRadius: 8,
                color: "var(--foreground)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {crews.map((crew, i) => (
              <Bar
                key={crew}
                dataKey={crew}
                stackId="manpower"
                fill={PALETTE[i % PALETTE.length]}
                radius={i === crews.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {totalByCrew.map(({ crew, total }) => (
          <div
            key={crew}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between text-sm"
          >
            <span className="text-zinc-300 truncate">{crew}</span>
            <span className="font-semibold text-zinc-100">{total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
