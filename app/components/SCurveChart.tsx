'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, Flag } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

type Point = { date: string; planned: number | null; actual: number | null };
type Data = { points: Point[]; sheets: string[]; today?: string };
type Baseline = { id: number; name: string; createdAt: string; createdBy: string | null; taskCount: number };

const fmtTick = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
};

// S-curve: tiến độ kế hoạch (nội suy từ ngày bắt đầu/kết thúc task)
// vs thực tế (tái dựng từ lịch sử cập nhật) — chuẩn báo cáo xây dựng.
// Chọn baseline đã chốt → đường kế hoạch dùng ngày gốc, đo được độ lệch thật khi PM dời ngày.
export default function SCurveChart() {
  const [data, setData] = useState<Data | null>(null);
  const [sheet, setSheet] = useState('');
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baseline, setBaseline] = useState(''); // id baseline | '' = kế hoạch hiện tại
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/baselines').then(r => r.ok ? r.json() : null).then(j => setBaselines(j?.baselines ?? []));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (sheet) qs.set('sheet', sheet);
    if (baseline) qs.set('baseline', baseline);
    const s = qs.toString();
    fetch(`/api/dashboard/scurve${s ? `?${s}` : ''}`).then(r => r.ok ? r.json() : null).then(setData);
  }, [sheet, baseline]);

  async function snapshotBaseline() {
    const name = window.prompt('Tên baseline (vd: "Kế hoạch hợp đồng", "Điều chỉnh đợt 1"):');
    if (name === null) return;
    setSaving(true);
    const res = await fetch('/api/baselines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert(j?.error ?? 'Không chốt được baseline');
      return;
    }
    const j = await res.json();
    setBaselines(b => [{ id: j.id, name: j.name, createdAt: '', createdBy: null, taskCount: j.taskCount }, ...b]);
    setBaseline(String(j.id));
  }

  if (!data || data.points.length < 2) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> S-curve: Kế hoạch vs Thực tế
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <select value={baseline} onChange={e => setBaseline(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300">
            <option value="">Kế hoạch hiện tại</option>
            {baselines.map(b => <option key={b.id} value={b.id}>📌 {b.name}</option>)}
          </select>
          <select value={sheet} onChange={e => setSheet(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300">
            <option value="">Toàn dự án</option>
            {data.sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={snapshotBaseline} disabled={saving} title="Lưu snapshot ngày BĐ/KT hiện tại làm mốc so sánh (Admin/PM)"
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 transition">
            <Flag className="w-3 h-3 text-amber-400" /> {saving ? 'Đang chốt…' : 'Chốt baseline'}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-600 mb-3">
        {baseline
          ? 'Đường kế hoạch theo ngày đã chốt trong baseline — thấy được độ lệch so với kế hoạch gốc kể cả khi đã dời ngày'
          : 'Đường kế hoạch nội suy từ ngày bắt đầu/kết thúc của từng task · đường thực tế tái dựng từ lịch sử cập nhật'}
      </p>
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
