'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import EditableText from '@/app/components/EditableText';

type ChartItem = { name: string; value: number; delayed: number };

export default function DashboardBarChart({ data }: { data: ChartItem[] }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-200 mb-4">
        <EditableText tkey="dashboard.chart.title">% Tiến độ trung bình theo Sheet</EditableText>
      </h2>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
            <XAxis dataKey="name" stroke="var(--color-zinc-600)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-zinc-600)" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: 'var(--color-zinc-800)' }}
              contentStyle={{ background: 'var(--color-zinc-900)', border: '1px solid var(--color-zinc-700)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 }}
              formatter={(v) => [`${v}%`, 'Tiến độ']}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.delayed > 0 ? 'var(--color-amber-500)' : 'var(--color-emerald-500)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
