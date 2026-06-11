'use client';
import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';

type Forecast = {
  sheetType: string; progress: number; ratePerWeek: number;
  deadline: string | null; eta: string | null; daysLeft: number | null; lateDays: number | null;
};

const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('vi-VN') : '—';

export default function ForecastCards() {
  const [data, setData] = useState<{ forecast: Forecast[]; windowDays: number } | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/forecast').then(r => r.ok ? r.json() : null).then(setData);
  }, []);

  if (!data || data.forecast.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <h2 className="font-semibold mb-1 text-sm text-zinc-300 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-emerald-400" /> Dự báo hoàn thành
      </h2>
      <p className="text-xs text-zinc-600 mb-3">Ngoại suy từ tốc độ cập nhật thực tế {data.windowDays} ngày gần nhất — cập nhật tiến độ càng đều, dự báo càng chính xác</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {data.forecast.map(f => {
          const done = f.progress >= 0.999;
          return (
            <div key={f.sheetType} className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
              <p className="text-xs text-zinc-400 uppercase truncate mb-1">{f.sheetType}</p>
              {done ? (
                <p className="text-emerald-400 font-semibold">✓ Đã hoàn thành</p>
              ) : f.eta ? (
                <>
                  <p className="text-lg font-bold">{fmt(f.eta)}</p>
                  <p className="text-xs text-zinc-500">còn ~{f.daysLeft} ngày · {(f.ratePerWeek * 100).toFixed(1)}%/tuần</p>
                  {f.lateDays !== null && (
                    <p className={`text-xs mt-1 font-medium ${f.lateDays > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {f.lateDays > 0 ? `⚠ trễ deadline ~${f.lateDays} ngày` : `✓ sớm hơn deadline ${-f.lateDays} ngày`}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-zinc-500 font-medium">Chưa đủ dữ liệu</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Cần cập nhật tiến độ thường xuyên trong {data.windowDays} ngày để có dự báo</p>
                </>
              )}
              {f.deadline && <p className="text-[11px] text-zinc-600 mt-1">Deadline: {fmt(f.deadline)}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
