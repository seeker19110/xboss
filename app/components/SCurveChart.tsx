'use client';
import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

type Point = { date: string; planned: number | null; actual: number | null };
type Data = { points: Point[]; sheets: string[]; today?: string };

const fmtTick = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
};

// S-curve: tiến độ kế hoạch (nội suy từ ngày bắt đầu/kết thúc task)
// vs thực tế (tái dựng từ lịch sử cập nhật) — chuẩn báo cáo xây dựng.
export default function SCurveChart() {
  const [data, setData] = useState<Data | null>(null);
  const [sheet, setSheet] = useState('');

  useEffect(() => {
    const qs = sheet ? `?sheet=${encodeURIComponent(sheet)}` : '';
    fetch(`/api/dashboard/scurve${qs}`).then(r => r.ok ? r.json() : null).then(setData);
  }, [sheet]);

  if (!data || data.points.length < 2) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> S-curve: Kế hoạch vs Thực tế
        </h2>
        <select value={sheet} onChange={e => setSheet(e.target.value)}
          className="ml-auto bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300">
          <option value="">Toàn dự án</option>
          {data.sheets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <p className="text-xs text-zinc-600 mb-3">Đường kế hoạch nội suy từ ngày bắt đầu/kết thúc của từng task · đường thực tế tái dựng từ lịch sử cập nhật</p>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickFormatter={fmtTick} minTickGap={40} />
            <YAxis stroke="#71717a" fontSize={11} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d) => new Date(String(d)).toLocaleDateString('vi-VN')}
              formatter={(v, name) => [`${v ?? '—'}%`, name === 'planned' ? 'Kế hoạch' : 'Thực tế']} />
            <Legend formatter={(v) => v === 'planned' ? 'Kế hoạch' : 'Thực tế'} wrapperStyle={{ fontSize: 12 }} />
            {data.today && <ReferenceLine x={data.today} stroke="#f59e0b" strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="planned" stroke="#71717a" strokeDasharray="6 4" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="actual" stroke="#10b981" dot={false} strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
