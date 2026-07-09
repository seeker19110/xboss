"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import EmptyState from "@/app/components/EmptyState";
import { CalendarCheck } from "lucide-react";

type ByDateRow = {
  workDate: string;
  crewId: number | null;
  crewName: string | null;
  totalHeadcount: number;
};

const PALETTE = [
  "var(--color-sky-500)",
  "var(--color-emerald-500)",
  "var(--color-amber-500)",
  "var(--color-violet-500)",
  "var(--color-rose-500)",
  "var(--color-zinc-500)",
];

export default function AttendanceChart({ rows }: { rows: ByDateRow[] }) {
  if (rows.length === 0)
    return <EmptyState icon={CalendarCheck} message="Chưa có dữ liệu chấm công trong tháng này" />;

  const crewLabel = (r: ByDateRow) => r.crewName ?? "Không rõ tổ";
  const crews = Array.from(new Set(rows.map(crewLabel))).sort();
  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const row = byDate.get(r.workDate) ?? {};
    row[crewLabel(r)] = (row[crewLabel(r)] ?? 0) + r.totalHeadcount;
    byDate.set(r.workDate, row);
  }
  const data = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({ date: date.slice(8, 10), ...row }));

  const totalByCrew = crews.map((crew) => ({
    crew,
    total: rows.filter((r) => crewLabel(r) === crew).reduce((s, r) => s + r.totalHeadcount, 0),
  }));

  return (
    <div className="space-y-4">
      <div style={{ width: "100%", height: 260 }}>
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
                stackId="attendance"
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
