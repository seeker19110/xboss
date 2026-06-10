'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Upload } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

type DelayedTask = {
  id: number; name: string; status: string;
  startDate: string; endDate: string;
  progressPercent: number; floorLabel: string;
  sheetType: string;
};

type KPI = { sheetType: string; total: number; avgProgress: number; delayed: number };

export default function Dashboard() {
  const [data, setData] = useState<{ delayedTasks: DelayedTask[]; kpi: KPI[]; totalDelayed: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Đang tải...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">🏗️ XBoss</h1>
          <p className="text-xs text-zinc-500">AVIO Tháp A — ACMV Tracking</p>
        </div>
        <a href="/import" className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition">
          <Upload className="w-4 h-4" /> Import Excel
        </a>
      </header>

      <main className="p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-red-950 border border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 uppercase">Tổng trễ</span>
            </div>
            <p className="text-3xl font-bold text-red-300">{data?.totalDelayed ?? 0}</p>
          </div>
          {data?.kpi.map(k => (
            <div key={k.sheetType} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400 uppercase mb-1">{k.sheetType}</p>
              <p className="text-2xl font-bold">{Math.round((k.avgProgress ?? 0) * 100)}%</p>
              <p className="text-xs text-zinc-500 mt-1">{k.delayed} trễ / {k.total} tasks</p>
              <div className="mt-2 bg-zinc-800 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(k.avgProgress ?? 0) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Bảng trễ */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-400" />
              Danh sách công việc đang trễ
            </h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">CHI TIẾT</th>
                  <th className="text-left p-3">TẦNG</th>
                  <th className="text-left p-3">KẾT THÚC</th>
                  <th className="text-left p-3">% TIẾN ĐỘ</th>
                  <th className="text-left p-3">SHEET</th>
                  <th className="text-left p-3">TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody>
                {data?.delayedTasks.map((t, i) => (
                  <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/50">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3 text-zinc-400">{t.floorLabel || '—'}</td>
                    <td className="p-3 text-red-400">{t.endDate}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-zinc-800 rounded-full h-1.5 w-16">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(t.progressPercent ?? 0) * 100}%` }} />
                        </div>
                        <span>{Math.round((t.progressPercent ?? 0) * 100)}%</span>
                      </div>
                    </td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-zinc-800 rounded text-xs">{t.sheetType}</span></td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-red-950 text-red-400 rounded text-xs">{STATUS_LABEL[t.status] ?? 'Đang trễ'}</span></td>
                  </tr>
                ))}
                {(!data?.delayedTasks.length) && (
                  <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Chưa có dữ liệu. Hãy import file Excel trước.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}