'use client';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';

type CellData = { tower: string | null; sheetType: string; floor: string; progress: number; tasks: number; delayed: number };
type Tower = { name: string; sheets: string[]; floors: string[] };
type Data = { towers: Tower[]; floors: string[]; sheets: string[]; cells: CellData[] };

// Màu nền theo % tiến độ; viền đỏ khi có task trễ.
function cellClass(progress: number, delayed: number): string {
  const ring = delayed > 0 ? ' ring-1 ring-red-500/70' : '';
  if (progress >= 0.999) return 'bg-emerald-600 text-white' + ring;
  if (progress >= 0.7) return 'bg-emerald-800 text-emerald-100' + ring;
  if (progress >= 0.4) return 'bg-amber-800 text-amber-100' + ring;
  if (progress > 0) return 'bg-red-900 text-red-200' + ring;
  return 'bg-zinc-800 text-zinc-500' + ring;
}

function TowerTable({ tower, byKey }: { tower: Tower; byKey: Map<string, CellData> }) {
  return (
    <table className="border-separate" style={{ borderSpacing: 3 }}>
      <thead>
        <tr>
          <th className="text-xs text-zinc-500 font-normal text-right pr-2 sticky left-0 bg-zinc-900">Tầng</th>
          {tower.sheets.map(s => (
            <th key={s} className="text-[11px] text-zinc-400 font-medium px-1 pb-1 whitespace-nowrap min-w-[88px]">{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tower.floors.map(f => (
          <tr key={f}>
            <td className="text-xs text-zinc-400 text-right pr-2 font-mono sticky left-0 bg-zinc-900">{f}</td>
            {tower.sheets.map(s => {
              const c = byKey.get(`${tower.name}|${f}|${s}`);
              if (!c) return <td key={s} className="rounded bg-zinc-900 border border-dashed border-zinc-800 text-center text-[10px] text-zinc-700 h-8">—</td>;
              const slug = slugFromCode(s);
              const inner = (
                <div className="flex items-center justify-center gap-1 h-8 px-2 text-xs font-medium">
                  {Math.round(c.progress * 100)}%
                  {c.delayed > 0 && <span className="text-[9px] bg-red-600/80 text-white rounded px-1">{c.delayed}</span>}
                </div>
              );
              return (
                <td key={s} className={`rounded text-center transition hover:scale-105 hover:z-10 ${cellClass(c.progress, c.delayed)}`}
                  title={`${s} · ${f}: ${Math.round(c.progress * 100)}% (${c.tasks} task${c.delayed ? `, ${c.delayed} trễ` : ''})`}>
                  {slug ? <a href={`/tracking/${slug}?floor=${encodeURIComponent(f)}`} className="block">{inner}</a> : inner}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function FloorHeatmap() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/floors').then(r => r.ok ? r.json() : null).then(setData);
  }, []);

  if (!data || data.floors.length === 0) return null;

  // Tương thích response cũ (chưa có towers) — gom tất cả về 1 tháp.
  const towers: Tower[] = data.towers?.length
    ? data.towers
    : [{ name: '', sheets: data.sheets, floors: data.floors }];

  const byKey = new Map(data.cells.map(c => [`${c.tower ?? ''}|${c.floor}|${c.sheetType}`, c]));
  const multi = towers.length > 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <h2 className="font-semibold mb-1 text-sm text-zinc-300 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-emerald-400" /> Bản đồ tiến độ theo tầng
      </h2>
      <p className="text-xs text-zinc-600 mb-3">Màu theo % hoàn thành · viền đỏ = có task trễ · bấm ô để mở sheet tại tầng đó</p>
      <div className="overflow-auto">
        {/* mx-auto + w-max: hẹp hơn khung thì căn giữa, rộng hơn thì cuộn ngang.
            Nhiều tháp → mỗi tháp 1 bảng cạnh nhau, cách nhau 10% bề rộng màn hình. */}
        <div className={`mx-auto w-max flex items-start ${multi ? 'gap-[10vw]' : ''}`}>
          {towers.map(t => (
            <div key={t.name}>
              {multi && (
                <p className="text-xs font-semibold text-zinc-300 text-center mb-2 flex items-center justify-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" /> {t.name || 'Chưa đặt tên tháp'}
                </p>
              )}
              <TowerTable tower={t} byKey={byKey} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
