'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';

type Bar = {
  id: number; code: string; name: string; floorLabel: string | null;
  startDate: string; endDate: string; progress: number; status: string; sheetType: string; sheetSlug: string | null;
};

const STATUS_BAR: Record<string, string> = {
  chuan_bi: 'bg-zinc-600', dang_thi_cong: 'bg-blue-600',
  hoan_thanh: 'bg-emerald-600', nghiem_thu: 'bg-teal-500', tre: 'bg-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

const DAY = 86400_000;
const d2n = (s: string) => new Date(s + 'T00:00:00Z').getTime();
const fmt = (s: string) => new Date(s).toLocaleDateString('vi-VN');

export default function GanttPage() {
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [sheetFilter, setSheetFilter] = useState('');

  useEffect(() => {
    fetch('/api/gantt').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      setBars((await r.json()).bars ?? []);
    });
  }, []);

  const view = useMemo(() => {
    if (!bars) return null;
    const list = bars.filter(b => !sheetFilter || b.sheetType === sheetFilter);
    if (list.length === 0) return { list, min: 0, max: 1, months: [] as { t: number; label: string }[] };
    const min = Math.min(...list.map(b => d2n(b.startDate)));
    const max = Math.max(...list.map(b => d2n(b.endDate))) + DAY;
    // Mốc đầu mỗi tháng trong khoảng hiển thị.
    const months: { t: number; label: string }[] = [];
    const c = new Date(min); c.setUTCDate(1);
    while (c.getTime() <= max) {
      if (c.getTime() >= min) months.push({ t: c.getTime(), label: `${c.getUTCMonth() + 1}/${c.getUTCFullYear() % 100}` });
      c.setUTCMonth(c.getUTCMonth() + 1);
    }
    return { list, min, max, months };
  }, [bars, sheetFilter]);

  if (!bars || !view) return <PageSkeleton />;

  const sheets = [...new Set(bars.map(b => b.sheetType))];
  const span = view.max - view.min || 1;
  const pos = (t: number) => ((t - view.min) / span) * 100;
  const today = Date.now();
  const groups = sheets.filter(s => !sheetFilter || s === sheetFilter);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back title={<><CalendarRange className="w-5 h-5 text-emerald-400" /> Gantt — Tiến độ theo nhóm</>}>
        <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)} aria-label="Lọc theo hệ"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả hệ</option>
          {sheets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </AppHeader>

      <div className="px-6 py-2 flex flex-wrap gap-3 text-xs text-zinc-400 border-b border-zinc-800/60">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={`w-3 h-2 rounded-sm ${STATUS_BAR[k]}`} /> {v}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-amber-400" /> Hôm nay</span>
      </div>

      <main className="p-4 overflow-auto">
        <div className="min-w-[800px]">
          {/* Trục thời gian */}
          <div className="relative h-6 ml-56 mr-2 border-b border-zinc-800">
            {view.months.map(m => (
              <span key={m.t} className="absolute text-[10px] text-zinc-500 -translate-x-1/2" style={{ left: `${pos(m.t)}%` }}>{m.label}</span>
            ))}
          </div>

          {groups.map(sheet => {
            const rows = view.list.filter(b => b.sheetType === sheet);
            const slug = rows[0]?.sheetSlug ?? slugFromCode(sheet);
            return (
              <section key={sheet} className="mb-6">
                <h2 className="text-sm font-semibold text-emerald-400 my-2">
                  {slug ? <a href={`/tracking/${slug}`} className="hover:underline">{sheet}</a> : sheet}
                  <span className="text-zinc-600 font-normal ml-2 text-xs">{rows.length} nhóm</span>
                </h2>
                <div className="space-y-px">
                  {rows.map(b => {
                    const l = pos(d2n(b.startDate));
                    const w = Math.max(pos(d2n(b.endDate) + DAY) - l, 0.5);
                    return (
                      <div key={b.id} className="flex items-center group hover:bg-zinc-900/70 rounded">
                        <div className="w-56 shrink-0 pr-3 text-right">
                          <span className="font-mono text-xs text-zinc-400">{b.code}</span>
                          <span className="text-[10px] text-zinc-600 ml-1">{b.floorLabel ?? ''}</span>
                        </div>
                        <div className="relative flex-1 h-5">
                          {/* gridline tháng */}
                          {view.months.map(m => (
                            <span key={m.t} className="absolute top-0 bottom-0 w-px bg-zinc-800/60" style={{ left: `${pos(m.t)}%` }} />
                          ))}
                          {/* vạch hôm nay */}
                          {today >= view.min && today <= view.max && (
                            <span className="absolute top-0 bottom-0 w-px bg-amber-400/80 z-10" style={{ left: `${pos(today)}%` }} />
                          )}
                          <a href={slug ? `/tracking/${slug}` : '#'}
                            title={`${b.code} — ${b.name}\n${fmt(b.startDate)} → ${fmt(b.endDate)} · ${Math.round(b.progress * 100)}% · ${STATUS_LABEL[b.status] ?? b.status}`}
                            className={`absolute top-0.5 bottom-0.5 rounded-sm ${STATUS_BAR[b.status] ?? 'bg-zinc-600'} opacity-80 hover:opacity-100 transition`}
                            style={{ left: `${l}%`, width: `${w}%` }}>
                            {/* % hoàn thành phủ bên trong */}
                            <span className="absolute inset-y-0 left-0 bg-white/25 rounded-sm" style={{ width: `${(b.progress ?? 0) * 100}%` }} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {view.list.length === 0 && <p className="p-8 text-center text-zinc-500">Không có nhóm nào có ngày bắt đầu/kết thúc.</p>}
        </div>
      </main>
    </div>
  );
}
