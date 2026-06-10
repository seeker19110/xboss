'use client';
import { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

type DelayedTask = { id: number; name: string; status: string; endDate: string; progressPercent: number; floorLabel: string; sheetType: string };
type KPI = { sheetType: string; total: number; avgProgress: number; delayed: number };

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('vi-VN');
}

export default function ReportPage() {
  const [data, setData] = useState<{ delayedTasks: DelayedTask[]; kpi: KPI[]; totalDelayed: number } | null>(null);

  useEffect(() => { fetch('/api/dashboard').then(r => r.json()).then(setData); }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="no-print sticky top-0 bg-zinc-100 border-b border-zinc-300 px-6 py-3 flex items-center gap-3">
        <a href="/" className="text-zinc-600 hover:text-zinc-900"><ArrowLeft className="w-5 h-5" /></a>
        <span className="text-sm text-zinc-600">Báo cáo in — dùng nút bên phải rồi chọn "Save as PDF"</span>
        <button onClick={() => window.print()} className="ml-auto flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm">
          <Printer className="w-4 h-4" /> In / Lưu PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        <div className="border-b-2 border-zinc-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold">BÁO CÁO TIẾN ĐỘ THI CÔNG ACMV</h1>
          <p className="text-zinc-600">TT AVIO — Tháp A · Ngày: {new Date().toLocaleDateString('vi-VN')}</p>
        </div>

        <h2 className="font-bold text-lg mb-3">1. Tổng quan KPI</h2>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border border-red-300 bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-600 uppercase">Tổng công việc trễ</p>
            <p className="text-3xl font-bold text-red-700">{data?.totalDelayed ?? 0}</p>
          </div>
          {data?.kpi.map(k => (
            <div key={k.sheetType} className="border border-zinc-300 rounded-lg p-3">
              <p className="text-xs text-zinc-500 uppercase">{k.sheetType}</p>
              <p className="text-2xl font-bold">{Math.round((k.avgProgress ?? 0) * 100)}%</p>
              <p className="text-xs text-zinc-500">{k.delayed} trễ / {k.total} task</p>
            </div>
          ))}
        </div>

        <h2 className="font-bold text-lg mb-3">2. Danh sách công việc đang trễ</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-100 border-y border-zinc-300 text-left">
              <th className="p-2">Chi tiết</th><th className="p-2">Sheet</th><th className="p-2">Tầng</th>
              <th className="p-2">Kết thúc</th><th className="p-2">%</th><th className="p-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data?.delayedTasks.map(t => (
              <tr key={t.id} className="border-b border-zinc-200">
                <td className="p-2">{t.name}</td>
                <td className="p-2">{t.sheetType}</td>
                <td className="p-2">{t.floorLabel || '—'}</td>
                <td className="p-2 text-red-600">{fmtDate(t.endDate)}</td>
                <td className="p-2">{Math.round((t.progressPercent ?? 0) * 100)}%</td>
                <td className="p-2">{STATUS_LABEL[t.status] ?? 'Đang trễ'}</td>
              </tr>
            ))}
            {!data?.delayedTasks.length && <tr><td colSpan={6} className="p-4 text-center text-zinc-400">Không có công việc trễ.</td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-zinc-400 mt-8">Xuất từ XBoss · Hệ thống quản lý thi công MEP</p>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>
    </div>
  );
}
