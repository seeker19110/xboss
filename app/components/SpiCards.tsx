"use client";
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

type Spi = {
  sheetType: string;
  planned: number;
  actual: number;
  spi: number | null;
  taskCount: number;
};
type Data = { spi: Spi[]; overall: Spi & { sheetType?: string } };

// Màu theo ngưỡng SPI: ≥1 đúng/vượt tiến độ, 0.9–1 hơi chậm, <0.9 chậm đáng kể.
function tone(spi: number | null) {
  if (spi === null)
    return { text: "text-zinc-400", ring: "border-zinc-800", label: "Chưa đủ dữ liệu" };
  if (spi >= 1)
    return { text: "text-emerald-400", ring: "border-emerald-500/30", label: "Đúng/vượt tiến độ" };
  if (spi >= 0.9) return { text: "text-amber-400", ring: "border-amber-500/30", label: "Hơi chậm" };
  return { text: "text-rose-400", ring: "border-rose-500/30", label: "Chậm đáng kể" };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default function SpiCards({ system }: { system?: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/dashboard/spi${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [system]);

  if (!data || data.overall.taskCount === 0) return null;

  const o = tone(data.overall.spi);

  return (
    <div className="bento-card p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-sky-400" /> Chỉ số hiệu suất tiến độ (SPI)
        </h2>
        <span className="text-xs text-zinc-500 font-medium">Earned Value Analysis</span>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        SPI = % thực tế ÷ % kế hoạch tại hôm nay. ≥ 1.0 đúng/vượt kế hoạch · 0.9–1.0 hơi chậm · &lt;
        0.9 chậm đáng kể.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className={`bento-card p-4 border ${o.ring} bg-zinc-950/80`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Toàn dự án
            </p>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold bg-zinc-900 border border-zinc-800 ${o.text}`}
            >
              {o.label}
            </span>
          </div>
          <p className={`text-3xl font-bold font-mono tabular-nums mt-2 ${o.text}`}>
            {data.overall.spi === null ? "—" : data.overall.spi.toFixed(2)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-2 pt-2 border-t border-zinc-800/80">
            Thực tế <span className="font-semibold text-zinc-200">{pct(data.overall.actual)}</span>{" "}
            · Kế hoạch{" "}
            <span className="font-semibold text-zinc-200">{pct(data.overall.planned)}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {data.spi.map((s) => {
          const t = tone(s.spi);
          return (
            <div
              key={s.sheetType}
              className={`bento-card p-3.5 border ${t.ring} bg-zinc-950/60 flex flex-col justify-between`}
            >
              <p className="text-xs font-bold text-zinc-300 uppercase truncate mb-1">
                {s.sheetType}
              </p>
              <p className={`text-2xl font-bold font-mono tabular-nums ${t.text}`}>
                {s.spi === null ? "—" : s.spi.toFixed(2)}
              </p>
              <p className="text-[11px] text-zinc-400 mt-2">
                TT {pct(s.actual)} · KH {pct(s.planned)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
