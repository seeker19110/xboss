'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Link2, X, Ban } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';
import { Modal, appAlert } from '@/app/components/dialogs';

type Bar = {
  id: number; code: string; name: string; floorLabel: string | null;
  startDate: string; endDate: string; progress: number; status: string; sheetType: string; sheetSlug: string | null;
};
type Dep = { id: number; predecessorId: number; successorId: number };
type Blocked = { id: number; preds: string[] };
type Me = { role: string };

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
  const [deps, setDeps] = useState<Dep[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [sheetFilter, setSheetFilter] = useState('');
  const [depFor, setDepFor] = useState<Bar | null>(null); // nhóm đang sửa phụ thuộc

  async function load() {
    const r = await fetch('/api/gantt');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const j = await r.json();
    setBars(j.bars ?? []); setDeps(j.deps ?? []); setBlocked(j.blocked ?? []);
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => setMe(j?.user ?? null));
    load();
  }, []);

  const canEdit = me?.role === 'admin' || me?.role === 'pm';
  const blockedMap = useMemo(() => new Map(blocked.map(b => [b.id, b.preds])), [blocked]);

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
      <AppHeader>
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
        <span className="flex items-center gap-1.5"><Ban className="w-3 h-3 text-rose-400" /> Bị chặn (việc trước chưa xong)</span>
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
                    const preds = blockedMap.get(b.id);
                    return (
                      <div key={b.id} className="flex items-center group hover:bg-zinc-900/70 rounded">
                        <div className="w-56 shrink-0 pr-3 text-right flex items-center justify-end gap-1.5">
                          {preds && <span title={`Chờ việc trước: ${preds.join(', ')}`}><Ban className="w-3 h-3 text-rose-400 shrink-0" /></span>}
                          <span className="font-mono text-xs text-zinc-400">{b.code}</span>
                          <span className="text-[10px] text-zinc-600">{b.floorLabel ?? ''}</span>
                          {canEdit && (
                            <button onClick={() => setDepFor(b)} aria-label={`Sửa phụ thuộc ${b.code}`}
                              className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-sky-400 transition">
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                            title={`${b.code} — ${b.name}\n${fmt(b.startDate)} → ${fmt(b.endDate)} · ${Math.round(b.progress * 100)}% · ${STATUS_LABEL[b.status] ?? b.status}${preds ? `\n⛔ Chờ việc trước: ${preds.join(', ')}` : ''}`}
                            className={`absolute top-0.5 bottom-0.5 rounded-sm ${STATUS_BAR[b.status] ?? 'bg-zinc-600'} opacity-80 hover:opacity-100 transition ${preds ? 'ring-1 ring-rose-400' : ''}`}
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

      {depFor && (
        <DependencyModal pkg={depFor} bars={bars} deps={deps}
          onClose={() => setDepFor(null)}
          onChanged={async () => { await load(); }} />
      )}
    </div>
  );
}

// ── Modal quản lý phụ thuộc của 1 nhóm: liệt kê việc trước + thêm/xoá ──────────
function DependencyModal({ pkg, bars, deps, onClose, onChanged }: {
  pkg: Bar; bars: Bar[]; deps: Dep[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = new Map(bars.map(b => [b.id, b]));
  const predDeps = deps.filter(d => d.successorId === pkg.id);
  const predIds = new Set(predDeps.map(d => d.predecessorId));
  // Ứng viên việc trước: cùng hệ, khác nhóm hiện tại, chưa là việc trước.
  const candidates = bars
    .filter(b => b.id !== pkg.id && b.sheetType === pkg.sheetType && !predIds.has(b.id))
    .sort((a, b) => a.code.localeCompare(b.code));

  async function add() {
    if (!pick) return;
    setBusy(true);
    const res = await fetch(`/api/packages/${pkg.id}/dependencies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predecessorId: Number(pick) }),
    });
    setBusy(false);
    if (!res.ok) { await appAlert((await res.json().catch(() => null))?.error ?? 'Không thêm được'); return; }
    setPick(''); await onChanged();
  }

  async function remove(depId: number) {
    setBusy(true);
    await fetch(`/api/package-dependencies/${depId}`, { method: 'DELETE' });
    setBusy(false);
    await onChanged();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-4">
        <h3 className="font-semibold mb-1 flex items-center gap-2"><Link2 className="w-4 h-4 text-sky-400" /> Phụ thuộc của {pkg.code}</h3>
        <p className="text-xs text-zinc-500 mb-3 truncate">{pkg.name}</p>

        <p className="text-xs font-medium text-zinc-400 mb-1.5">Việc trước (phải xong trước nhóm này)</p>
        {predDeps.length === 0 ? (
          <p className="text-xs text-zinc-600 mb-3">Chưa có phụ thuộc nào.</p>
        ) : (
          <ul className="space-y-1 mb-3">
            {predDeps.map(d => {
              const p = byId.get(d.predecessorId);
              const done = (p?.progress ?? 0) >= 1;
              return (
                <li key={d.id} className="flex items-center gap-2 text-sm bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${done ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span className="font-mono text-xs text-zinc-300">{p?.code ?? `#${d.predecessorId}`}</span>
                  <span className="text-xs text-zinc-500 truncate flex-1">{p?.name ?? ''}</span>
                  <span className="text-[11px] text-zinc-500">{Math.round((p?.progress ?? 0) * 100)}%</span>
                  <button onClick={() => remove(d.id)} disabled={busy} aria-label="Xoá phụ thuộc" className="text-zinc-500 hover:text-rose-400">
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-2">
          <select value={pick} onChange={e => setPick(e.target.value)} disabled={busy}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm outline-none">
            <option value="">+ Thêm việc trước…</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <button onClick={add} disabled={!pick || busy}
            className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-40 rounded-lg">Thêm</button>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg">Đóng</button>
        </div>
      </div>
    </Modal>
  );
}
