'use client';
import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';

type Spi = { sheetType: string; planned: number; actual: number; spi: number | null; taskCount: number };
type Data = { spi: Spi[]; overall: Spi & { sheetType?: string } };

// Màu theo ngưỡng SPI: ≥1 đúng/vượt tiến độ, 0.9–1 hơi chậm, <0.9 chậm đáng kể.
function tone(spi: number | null) {
  if (spi === null) return { text: 'text-zinc-400', ring: 'border-zinc-800', label: 'Chưa đủ dữ liệu' };
  if (spi >= 1) return { text: 'text-emerald-400', ring: 'border-emerald-500/30', label: 'Đúng/vượt tiến độ' };
  if (spi >= 0.9) return { text: 'text-amber-400', ring: 'border-amber-500/30', label: 'Hơi chậm' };
  return { text: 'text-rose-400', ring: 'border-rose-500/30', label: 'Chậm đáng kể' };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default function SpiCards() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/spi').then(r => r.ok ? r.json() : null).then(setData);
  }, []);

  if (!data || (data.overall.taskCount === 0)) return null;

  const o = tone(data.overall.spi);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <h2 className="font-semibold mb-1 text-sm text-zinc-300 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-sky-400" /> Chỉ số tiến độ (SPI)
      </h2>
      <p className="text-xs text-zinc-400 mb-3">
        SPI = % thực tế ÷ % kế hoạch tại hôm nay. ≥ 1 đúng/vượt kế hoạch · 0.9–1 hơi chậm · &lt; 0.9 chậm đáng kể.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <div className={`bg-zinc-950/60 border ${o.ring} rounded-lg p-3 lg:col-span-1`}>
          <p className="text-xs text-zinc-400 uppercase mb-1">Toàn dự án</p>
          <p className={`text-3xl font-bold ${o.text}`}>{data.overall.spi === null ? '—' : data.overall.spi.toFixed(2)}</p>
          <p className={`text-xs mt-1 font-medium ${o.text}`}>{o.label}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Thực tế {pct(data.overall.actual)} · Kế hoạch {pct(data.overall.planned)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {data.spi.map(s => {
          const t = tone(s.spi);
          return (
            <div key={s.sheetType} className={`bg-zinc-950/60 border ${t.ring} rounded-lg p-3`}>
              <p className="text-xs text-zinc-400 uppercase truncate mb-1">{s.sheetType}</p>
              <p className={`text-xl font-bold ${t.text}`}>{s.spi === null ? '—' : s.spi.toFixed(2)}</p>
              <p className="text-[11px] text-zinc-400 mt-1">TT {pct(s.actual)} · KH {pct(s.planned)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
