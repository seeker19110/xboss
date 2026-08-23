"use client";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatDateVN } from "@/lib/nen/date";

type Forecast = {
  sheetType: string;
  progress: number;
  ratePerWeek: number;
  deadline: string | null;
  eta: string | null;
  daysLeft: number | null;
  lateDays: number | null;
};

const fmt = (s: string | null) => formatDateVN(s);

export default function ForecastCards({ system }: { system?: string }) {
  const [data, setData] = useState<{ forecast: Forecast[]; windowDays: number } | null>(null);

  useEffect(() => {
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/dashboard/forecast${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [system]);

  if (!data || data.forecast.length === 0) return null;

  return (
    <div className="bento-card p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Dự báo hoàn thành tiến độ
        </h2>
        <span className="text-xs text-zinc-500 font-medium">
          Ngoại suy {data.windowDays} ngày gần nhất
        </span>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        Tính toán từ tốc độ cập nhật thực tế — cập nhật tiến độ càng đều, dự báo càng chính xác.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {data.forecast.map((f) => {
          const done = f.progress >= 0.999;
          return (
            <div
              key={f.sheetType}
              className="bento-card p-4 bg-zinc-950/70 flex flex-col justify-between"
            >
              <div>
                <p className="text-xs font-bold text-zinc-300 uppercase truncate mb-1.5">
                  {f.sheetType}
                </p>
                {done ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-bold px-2 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/60">
                    ✓ Đã hoàn thành
                  </span>
                ) : f.eta ? (
                  <>
                    <p className="text-xl font-bold font-mono tabular-nums text-zinc-100">
                      {fmt(f.eta)}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      còn ~<span className="font-semibold text-zinc-200">{f.daysLeft}</span> ngày ·{" "}
                      {(f.ratePerWeek * 100).toFixed(1)}%/tuần
                    </p>
                    {f.lateDays !== null && (
                      <p
                        className={`text-xs mt-2 font-semibold ${f.lateDays > 0 ? "text-rose-400" : "text-emerald-400"}`}
                      >
                        {f.lateDays > 0
                          ? `⚠ Trễ hạn ~${f.lateDays} ngày`
                          : `✓ Sớm hơn hạn ${-f.lateDays} ngày`}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-zinc-400 font-medium">Chưa đủ dữ liệu</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Cần cập nhật đều trong {data.windowDays} ngày
                    </p>
                  </>
                )}
              </div>
              {f.deadline && (
                <p className="text-[11px] text-zinc-500 mt-3 pt-2 border-t border-zinc-800/80 font-mono">
                  Hạn chót: {fmt(f.deadline)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
