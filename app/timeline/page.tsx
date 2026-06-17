'use client';
import { useEffect, useState } from 'react';
import { Layers, TrendingUp, AlertTriangle } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';

// ── Types ──────────────────────────────────────────────────────────────────────

type CurrentCell = {
  floorLabel: string; sheetType: string; sheetSlug: string | null;
  progress: number; tasks: number; delayed: number;
};
type HistoryRow = { floorLabel: string; weekStart: string; avgProgress: number };
type ApiData = {
  current: CurrentCell[]; history: HistoryRow[];
  weeks: string[]; floors: string[]; sheets: { code: string; slug: string | null }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function progressColor(p: number, delayed: number): string {
  if (p <= 0)              return 'bg-zinc-800 text-zinc-600';
  if (delayed > 0 && p < 1) return 'bg-red-900/70 text-red-300';
  if (p >= 1)              return 'bg-emerald-700 text-emerald-100';
  if (p >= 0.8)            return 'bg-emerald-800/80 text-emerald-200';
  if (p >= 0.5)            return 'bg-sky-900/80 text-sky-200';
  if (p >= 0.2)            return 'bg-amber-900/80 text-amber-200';
  return 'bg-zinc-700/70 text-zinc-300';
}

function historyColor(p: number): string {
  if (p <= 0)   return 'bg-zinc-800';
  if (p >= 1)   return 'bg-emerald-600';
  if (p >= 0.8) return 'bg-emerald-700/80';
  if (p >= 0.5) return 'bg-sky-700/80';
  if (p >= 0.2) return 'bg-amber-700/80';
  return 'bg-zinc-600/60';
}

function fmtWeek(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'current' | 'history'>('current');
  const [sheetFilter, setSheetFilter] = useState('all');

  useEffect(() => {
    fetch('/api/timeline').then(async r => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      setData(await r.json());
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (!data) return null;

  const { current, history, weeks, floors, sheets } = data;

  const filteredSheets = sheetFilter === 'all' ? sheets : sheets.filter(s => s.code === sheetFilter);

  // Map tra nhanh
  const currentMap = new Map<string, CurrentCell>();
  for (const c of current) {
    const key = `${c.floorLabel}__${c.sheetType}`;
    currentMap.set(key, c);
  }

  const histMap = new Map<string, number>();
  for (const h of history) {
    const key = `${h.floorLabel}__${h.weekStart}`;
    histMap.set(key, Math.max(histMap.get(key) ?? 0, h.avgProgress));
  }

  // Tiến độ trung bình theo tầng (qua hệ đang lọc)
  const floorSummary = floors.map(floor => {
    const cells = filteredSheets
      .map(s => currentMap.get(`${floor}__${s.code}`))
      .filter(Boolean) as CurrentCell[];
    const avg = cells.length ? cells.reduce((s, c) => s + c.progress, 0) / cells.length : 0;
    const delayed = cells.reduce((s, c) => s + c.delayed, 0);
    return { floor, avg, delayed, taskCount: cells.reduce((s, c) => s + c.tasks, 0) };
  }).filter(f => f.taskCount > 0);

  const visibleFloors = mode === 'history'
    ? floors.filter(f => history.some(h => h.floorLabel === f) || current.some(c => c.floorLabel === f))
    : floorSummary.map(f => f.floor);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Timeline tầng" back />

      <main className="px-3 sm:px-6 py-4 space-y-4 max-w-5xl mx-auto w-full">

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
            <button onClick={() => setMode('current')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${mode === 'current' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Hiện tại</span>
              <span className="sm:hidden">Tầng×Hệ</span>
            </button>
            <button onClick={() => setMode('history')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${mode === 'history' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Lịch sử</span>
              <span className="sm:hidden">Tầng×Tuần</span>
            </button>
          </div>

          <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-2 focus:outline-none min-w-0">
            <option value="all">Tất cả hệ</option>
            {sheets.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-[11px] text-zinc-500">
          {[
            { cls: 'bg-zinc-800', label: '0%' },
            { cls: 'bg-zinc-600/60', label: '<20%' },
            { cls: 'bg-amber-700/80', label: '20–50%' },
            { cls: 'bg-sky-700/80', label: '50–80%' },
            { cls: 'bg-emerald-700/80', label: '80–99%' },
            { cls: 'bg-emerald-600', label: '100%' },
            { cls: 'bg-red-900/70', label: 'Trễ' },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1 shrink-0">
              <span className={`inline-block w-3 h-3 sm:w-4 sm:h-4 rounded ${l.cls}`} />
              {l.label}
            </span>
          ))}
        </div>

        {/* ══ MODE: CURRENT — tầng × hệ ══ */}
        {mode === 'current' && (
          <>
            {floorSummary.length === 0 ? (
              <div className="py-14 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Chưa có dữ liệu tầng.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4"
                style={{ WebkitOverflowScrolling: 'touch' }}>
                <p className="text-[10px] text-zinc-600 mb-1 sm:hidden">← Vuốt ngang để xem đủ cột →</p>
                <table className="border-separate border-spacing-1" style={{ minWidth: `${80 + 56 + filteredSheets.length * 76}px` }}>
                  <thead>
                    <tr>
                      {/* Sticky cột tầng */}
                      <th className="sticky left-0 z-10 bg-zinc-950 text-left pl-0 pr-2 py-1.5 text-xs font-semibold text-zinc-500 w-16 sm:w-20">
                        Tầng
                      </th>
                      <th className="text-right px-2 py-1.5 text-xs font-semibold text-zinc-500 w-12 sm:w-14">TB</th>
                      {filteredSheets.map(s => (
                        <th key={s.code} className="text-center px-1 py-1.5 text-[10px] sm:text-[11px] font-semibold text-zinc-400 w-16 sm:w-20">
                          {s.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {floorSummary.map(({ floor, avg, delayed }) => (
                      <tr key={floor}>
                        <td className="sticky left-0 z-10 bg-zinc-950 pr-2 py-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-zinc-200 whitespace-nowrap">{floor}</span>
                            {delayed > 0 && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                          </div>
                        </td>
                        <td className="text-right pr-2 py-0.5">
                          <span className={`text-xs font-bold tabular-nums ${avg >= 1 ? 'text-emerald-400' : avg >= 0.5 ? 'text-sky-400' : 'text-zinc-400'}`}>
                            {Math.round(avg * 100)}%
                          </span>
                        </td>
                        {filteredSheets.map(s => {
                          const cell = currentMap.get(`${floor}__${s.code}`);
                          const p = cell?.progress ?? -1;
                          const href = s.slug ? `/tracking/${s.slug}?floor=${encodeURIComponent(floor)}` : '#';
                          return (
                            <td key={s.code} className="text-center py-0.5">
                              {p < 0 ? (
                                <span className="inline-block w-14 sm:w-16 h-8 rounded bg-zinc-900 border border-zinc-800/30" />
                              ) : (
                                <a href={href}
                                  className={`inline-flex flex-col items-center justify-center w-14 sm:w-16 h-8 rounded text-[10px] font-bold tabular-nums transition active:opacity-60 hover:opacity-80 ${progressColor(p, cell?.delayed ?? 0)}`}
                                  title={`${floor} · ${s.code} · ${Math.round(p * 100)}%${cell?.delayed ? ` · ${cell.delayed} trễ` : ''}`}>
                                  {Math.round(p * 100)}%
                                  {(cell?.delayed ?? 0) > 0 && <span className="text-[9px] leading-none opacity-80">{cell!.delayed} trễ</span>}
                                </a>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══ MODE: HISTORY — tầng × tuần ══ */}
        {mode === 'history' && (
          <>
            {weeks.length === 0 ? (
              <div className="py-14 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Chưa có lịch sử tiến độ (cần ít nhất 1 tuần dữ liệu).</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4"
                style={{ WebkitOverflowScrolling: 'touch' }}>
                <p className="text-[10px] text-zinc-600 mb-1 sm:hidden">← Vuốt ngang để xem đủ tuần →</p>
                <table className="border-separate border-spacing-1" style={{ minWidth: `${80 + weeks.length * 40 + 52}px` }}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-zinc-950 text-left pl-0 pr-2 py-1.5 text-xs font-semibold text-zinc-500 w-16 sm:w-20">
                        Tầng
                      </th>
                      {weeks.map(w => (
                        <th key={w} className="text-center px-0.5 py-1.5 text-[10px] text-zinc-500 w-8 sm:w-10">
                          {fmtWeek(w)}
                        </th>
                      ))}
                      <th className="text-center px-1 py-1.5 text-[10px] font-semibold text-zinc-300 w-10 sm:w-12 whitespace-nowrap">
                        Nay
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFloors.map(floor => {
                      const curCells = filteredSheets
                        .map(s => currentMap.get(`${floor}__${s.code}`))
                        .filter(Boolean) as CurrentCell[];
                      const curAvg = curCells.length ? curCells.reduce((s, c) => s + c.progress, 0) / curCells.length : 0;
                      const hasDelayed = curCells.some(c => c.delayed > 0);

                      return (
                        <tr key={floor}>
                          <td className="sticky left-0 z-10 bg-zinc-950 pr-2 py-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-bold text-zinc-200 whitespace-nowrap">{floor}</span>
                              {hasDelayed && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                            </div>
                          </td>
                          {weeks.map(w => {
                            const p = histMap.get(`${floor}__${w}`) ?? -1;
                            return (
                              <td key={w} className="text-center py-0.5">
                                {p < 0 ? (
                                  <span className="inline-block w-7 sm:w-8 h-7 sm:h-8 rounded bg-zinc-900 opacity-20" />
                                ) : (
                                  <span className={`inline-flex items-center justify-center w-7 sm:w-8 h-7 sm:h-8 rounded text-[9px] sm:text-[10px] font-bold tabular-nums ${historyColor(p)}`}
                                    title={`${floor} · ${fmtWeek(w)} · ${Math.round(p * 100)}%`}>
                                    {Math.round(p * 100)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-center py-0.5">
                            <span className={`inline-flex items-center justify-center w-9 sm:w-10 h-7 sm:h-8 rounded text-[10px] font-bold tabular-nums border border-zinc-600 ${historyColor(curAvg)}`}>
                              {Math.round(curAvg * 100)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
