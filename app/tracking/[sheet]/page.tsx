'use client';
import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { Search, ChevronRight, ChevronDown, Pencil, Check, X, History, RefreshCw, Link2, Camera, Trash2, Upload, MessageSquare, Send, WifiOff, CloudUpload, ChevronUp, ChevronDown as ChevronDownIcon, Columns, Copy, RotateCcw, CalendarDays } from 'lucide-react';
import { useOfflineTickQueue } from '@/app/components/offlineQueue';
import AppHeader from '@/app/components/AppHeader';
import { Modal, appAlert, appConfirm, appPrompt } from '@/app/components/dialogs';
import { PageSkeleton } from '@/app/components/Skeleton';
import { DELAY_REASON_LABEL } from '@/lib/delay';
import { toSlug } from '@/lib/sheets';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};
const STATUS_CLS: Record<string, string> = {
  chuan_bi: 'bg-zinc-800 text-zinc-300', dang_thi_cong: 'bg-blue-950 text-blue-300',
  hoan_thanh: 'bg-emerald-950 text-emerald-300', nghiem_thu: 'bg-teal-950 text-teal-300',
  tre: 'bg-red-950 text-red-300',
};

type Task = { id: number; code: string; name: string; status: string; endDate: string | null; progressPercent: number };
type Pkg = { id: number; code: string; floorLabel: string | null; name: string; status: string; progress: number; tasks: Task[]; boqCode: string | null; drawingUrl: string | null; startDate: string | null; endDate: string | null };
type Data = { sheet: { id?: number; code: string; name: string; responsible?: string; slug?: string }; packages: Pkg[]; version?: string };

const SYNC_POLL_MS = 10_000;

// Màn hẹp (điện thoại ngoài công trường): 4 cột sticky chiếm 526px sẽ nuốt hết
// viewport — thu lại chỉ giữ cột tên task sticky để vẫn tick checkbox được.
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

// Ngày rút gọn d/M cho dòng task (đỡ chiếm chỗ trên lưới).
const fmtShortDate = (d: string | null) => {
  if (!d) return '?';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '?' : `${dt.getDate()}/${dt.getMonth() + 1}`;
};

// Số ngày thi công (bao gồm 2 đầu).
const diffDays = (s: string | null, e: string | null) => {
  if (!s || !e) return null;
  const d = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000);
  return d >= 0 ? d + 1 : null;
};

export default function TrackingPage({ params }: { params: { sheet: string } }) {
  const { sheet } = params;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState('');
  // ?floor=4F trên URL (từ heatmap Dashboard) → mở sẵn filter tầng.
  const [floorFilter, setFloorFilter] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('floor') ?? '' : '');
  const [statusFilter, setStatusFilter] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sheetModal, setSheetModal] = useState<{ name: string; code: string; slug: string; responsible: string } | null>(null);
  const [sheetErr, setSheetErr] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncToast, setSyncToast] = useState(false);
  const versionRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const load = useCallback(() => {
    fetch(`/api/tasks?sheet=${sheet}`).then(r => r.json()).then((d: Data) => {
      setData(d);
      if (d?.version) versionRef.current = d.version;
    }).catch(() => { /* mất mạng — giữ dữ liệu đang hiển thị */ }).finally(() => setLoading(false));
  }, [sheet]);
  useEffect(() => { load(); }, [load]);

  // Hàng đợi offline: tick khi mất mạng được gửi lại tự động lúc có mạng.
  const { pending: offlinePending, online, enqueue } = useOfflineTickQueue(load);

  // Đồng bộ đa người dùng: SSE (/api/events, độ trễ ~3s) — lỗi/timeout thì
  // fallback về poll watermark 10s như trước. Người khác sửa → tự reload + toast.
  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const applyVersion = (v: string) => {
      if (document.hidden) return;
      if (versionRef.current && v !== versionRef.current) {
        versionRef.current = v;
        load();
        setRefreshKey(k => k + 1);
        setSyncToast(true);
        setTimeout(() => setSyncToast(false), 3500);
      } else {
        versionRef.current = v;
      }
    };

    const startPolling = () => {
      if (pollTimer || stopped) return;
      pollTimer = setInterval(async () => {
        if (document.hidden) return;
        try {
          const r = await fetch(`/api/tasks/version?sheet=${sheet}`);
          if (!r.ok) return;
          applyVersion((await r.json()).v);
        } catch { /* mạng chập chờn — thử lại lần poll sau */ }
      }, SYNC_POLL_MS);
    };

    if (typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/events?sheet=${sheet}`);
      es.addEventListener('version', e => {
        try { applyVersion(JSON.parse((e as MessageEvent).data).v); } catch { /* payload lạ — bỏ qua */ }
      });
      es.onerror = () => { es?.close(); es = null; startPolling(); };
    } else {
      startPolling();
    }

    return () => { stopped = true; es?.close(); if (pollTimer) clearInterval(pollTimer); };
  }, [sheet, load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => {
      if (!j) { window.location.href = '/login'; return; }
      const role = j?.user?.role;
      const editable = role === 'admin' || role === 'pm';
      setCanEdit(editable);
      setIsAdmin(role === 'admin');
    });
  }, []);

  // Đổi tên / mã / đường dẫn của trang tracking (sheet) — slug đổi thì chuyển sang URL mới.
  async function saveSheet() {
    if (!sheetModal || !data?.sheet.id) return;
    const res = await fetch(`/api/sheets/${data.sheet.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sheetModal.name, code: sheetModal.code, slug: sheetModal.slug, responsible: sheetModal.responsible }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setSheetErr(j?.error ?? 'Không lưu được'); return; }
    if (j.sheet.slug !== sheet) { window.location.href = `/tracking/${j.sheet.slug}`; return; }
    setSheetModal(null); load();
  }

  async function deleteSheet() {
    if (!data?.sheet.id) return;
    if (!await appConfirm(`Xoá trang "${data.sheet.name}" cùng TOÀN BỘ nhóm, task, checkbox và vật tư của nó? Không hoàn tác được.`, { danger: true, confirmLabel: 'Xoá trang' })) return;
    const res = await fetch(`/api/sheets/${data.sheet.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => null); setSheetErr(j?.error ?? 'Không xoá được'); return; }
    window.location.href = '/';
  }

  if (loading) return <PageSkeleton />;

  const floors = [...new Set((data?.packages ?? []).map(p => p.floorLabel).filter((f): f is string => !!f))]
    .sort((a, b) => parseInt(a) - parseInt(b));
  const q = query.toLowerCase();
  const packages = (data?.packages ?? []).filter(p =>
    (!q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.boqCode ?? '').toLowerCase().includes(q))
    && (!floorFilter || p.floorLabel === floorFilter)
    && (!statusFilter || p.status === statusFilter));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back search={false}
        title={
          <>
            {data?.sheet.name ?? sheet}
            {canEdit && data?.sheet.id && (
              <button onClick={() => { setSheetErr(''); setSheetModal({
                  name: data.sheet.name, code: data.sheet.code,
                  slug: data.sheet.slug ?? sheet, responsible: data.sheet.responsible ?? '' }); }}
                title="Đổi tên / đường dẫn trang" aria-label="Đổi tên / đường dẫn trang"
                className="text-zinc-600 hover:text-amber-400">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        }
        subtitle={`${data?.sheet.code ?? ''} ${data?.sheet.responsible ? `· ${data.sheet.responsible}` : ''}`}>
        {canEdit && <span className="text-xs bg-emerald-950 text-emerald-400 px-2 py-1 rounded hidden sm:inline">Chế độ chỉnh sửa (Admin/PM)</span>}
      </AppHeader>

      <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-zinc-800/60">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhóm/tầng..."
            className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56 outline-none focus:border-emerald-600" />
        </div>
        <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả tầng</option>
          {floors.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-xs text-zinc-500 ml-auto">{packages.length} nhóm · bấm vào nhóm để mở lưới checkbox</span>
      </div>

      <main className="p-4 space-y-2">
        {packages.map((p, pi) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <PkgGrid
              pkg={p} pkgIdx={pi} pkgCount={packages.length}
              expanded={!!expanded[p.id]}
              onToggle={() => setExpanded(s => ({ ...s, [p.id]: !s[p.id] }))}
              canEdit={canEdit} refreshKey={refreshKey} isMobile={isMobile}
              onChanged={load} onOfflineTick={enqueue}
            />
          </div>
        ))}
        {packages.length === 0 && (
          <div className="p-8 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">{'Không có dữ liệu. Hãy import file Excel hoặc copy từ trang khác.'}</div>
        )}
      </main>

      {syncToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-900/95 border border-emerald-700 text-emerald-200 px-4 py-2 rounded-full text-sm shadow-xl"
          style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px) + 0.5rem)' }}>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dữ liệu vừa được người khác cập nhật — đã làm mới
        </div>
      )}

      {(!online || offlinePending > 0) && (
        <div className={`fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm shadow-xl border ${
          online ? 'bg-sky-900/95 border-sky-700 text-sky-200' : 'bg-amber-900/95 border-amber-700 text-amber-200'}`}
          style={{ bottom: 'max(4rem, env(safe-area-inset-bottom, 0px) + 3.5rem)' }}>
          {online
            ? <><CloudUpload className="w-3.5 h-3.5 animate-pulse" /> Đang gửi lại {offlinePending} thay đổi đã lưu offline...</>
            : <><WifiOff className="w-3.5 h-3.5" /> Mất mạng — thao tác vẫn được lưu{offlinePending > 0 ? ` (${offlinePending} chờ gửi)` : ''}, tự đồng bộ khi có mạng</>}
        </div>
      )}

      {/* Modal đổi tên / đường dẫn trang */}
      {sheetModal && (
        <Modal onClose={() => setSheetModal(null)}>
          <div className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Pencil className="w-4 h-4 text-amber-400" /> Cài đặt trang tracking</h3>
            <label className="block text-xs text-zinc-400 mb-1">Tên trang</label>
            <input autoFocus value={sheetModal.name}
              onChange={e => setSheetModal(m => m && ({ ...m, name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600" />
            <label className="block text-xs text-zinc-400 mb-1">Mã sheet (hiển thị trên Dashboard/Excel)</label>
            <input value={sheetModal.code}
              onChange={e => setSheetModal(m => m && ({ ...m, code: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600" />
            <label className="block text-xs text-zinc-400 mb-1">Đường dẫn</label>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-zinc-500">/tracking/</span>
              <input value={sheetModal.slug}
                onChange={e => setSheetModal(m => m && ({ ...m, slug: e.target.value }))}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 font-mono" />
              <button onClick={() => setSheetModal(m => m && ({ ...m, slug: toSlug(m.name) }))}
                title="Sinh lại từ tên" className="text-xs text-zinc-500 hover:text-emerald-400 px-1">↻</button>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">Chỉ dùng chữ thường a-z, số và gạch nối. Đổi đường dẫn sẽ chuyển trang sang URL mới (link cũ hết hiệu lực).</p>
            <label className="block text-xs text-zinc-400 mb-1">Người phụ trách</label>
            <input value={sheetModal.responsible}
              onChange={e => setSheetModal(m => m && ({ ...m, responsible: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600" />
            {sheetErr && <p className="text-xs text-red-400 mb-2">{sheetErr}</p>}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button onClick={deleteSheet} className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950/60 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" /> Xoá trang
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => setSheetModal(null)} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg">Huỷ</button>
                <button onClick={saveSheet} disabled={!sheetModal.name.trim() || !sheetModal.code.trim()}
                  className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg font-medium">Lưu</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

type Cell = { id: number; installed: boolean };
type GridTask = { id: number; code: string; name: string; status: string; progressPercent: number; boqCode: string | null; drawingUrl: string | null; photoCount: number; commentCount: number; delayReason: string | null; startDate: string | null; endDate: string | null; cells: Record<string, Cell> };
type Grid = { columns: string[]; tasks: GridTask[] };

function PkgGrid({ pkg, pkgIdx, pkgCount, expanded, onToggle, canEdit, refreshKey, isMobile, onChanged, onOfflineTick }: {
  pkg: Pkg; pkgIdx: number; pkgCount: number; expanded: boolean; onToggle: () => void;
  canEdit: boolean; refreshKey: number; isMobile: boolean;
  onChanged: () => void; onOfflineTick: (dimId: number, installed: boolean) => void;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [editTask, setEditTask] = useState<{ id: number; value: string } | null>(null);
  const [historyTask, setHistoryTask] = useState<GridTask | null>(null);
  const [photosTask, setPhotosTask] = useState<GridTask | null>(null);
  const [commentsTask, setCommentsTask] = useState<GridTask | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [datesTarget, setDatesTarget] = useState<{ ids: number[]; init: { start: string; end: string } } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/workpackages/${pkg.id}/dimensions`).then(r => r.json()).then(setGrid)
      .catch(() => { /* mất mạng — giữ lưới đang hiển thị */ });
  }, [pkg.id]);
  useEffect(() => { if (expanded) load(); }, [load, refreshKey, expanded]);

  // ── Hàm thao tác nhóm (pkg) ──────────────────────────────────────────────

  async function editPkgBoq() {
    const v = await appPrompt('BOQCODE của nhóm (duy nhất toàn hệ thống, để trống = xoá mã)', pkg.boqCode ?? '', { mono: true });
    if (v === null) return;
    const res = await fetch(`/api/workpackages/${pkg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boqCode: v }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    onChanged();
  }

  async function editPkgDrawing() {
    const v = await appPrompt('Link bản vẽ / BBNT của nhóm (để trống = xoá)', pkg.drawingUrl ?? '');
    if (v === null) return;
    await fetch(`/api/workpackages/${pkg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drawingUrl: v.trim() || null }),
    });
    onChanged();
  }

  async function savePkgName(name: string) {
    await fetch(`/api/workpackages/${pkg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    setEditName(null); onChanged();
  }

  async function savePkgDates(start: string, end: string) {
    await fetch(`/api/workpackages/${pkg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start || null, endDate: end || null }),
    });
    setShowDatesModal(false); onChanged();
  }

  async function movePkg(direction: 'up' | 'down') {
    await fetch(`/api/workpackages/${pkg.id}/move`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
    });
    onChanged();
  }

  async function copyPkg() {
    const code = await appPrompt('Mã nhóm mới', `${pkg.code}_copy`, { mono: true });
    if (!code?.trim()) return;
    const name = await appPrompt('Tên nhóm mới', `${pkg.name} (bản sao)`);
    if (!name?.trim()) return;
    const res = await fetch(`/api/workpackages/${pkg.id}/copy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), afterId: pkg.id }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    onChanged();
  }

  async function deletePkg() {
    if (!await appConfirm(`Xoá nhóm "${pkg.code} — ${pkg.name}"?\n\nToàn bộ ${pkg.tasks.length} task và dữ liệu liên quan sẽ bị xoá vĩnh viễn.`, { danger: true, confirmLabel: 'Xoá nhóm' })) return;
    const res = await fetch(`/api/workpackages/${pkg.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    onChanged();
  }

  // ── Hàm thao tác task ────────────────────────────────────────────────────

  async function toggle(cell: Cell, task: GridTask, label: string) {
    setGrid(g => g && ({
      ...g, tasks: g.tasks.map(t => t.id === task.id
        ? { ...t, cells: { ...t.cells, [label]: { ...cell, installed: !cell.installed } } } : t),
    }));
    try {
      const res = await fetch(`/api/dimensions/${cell.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installed: !cell.installed }),
      });
      const j = await res.json().catch(() => null);
      if (j?.task) setGrid(g => g && ({ ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, progressPercent: j.task.progress, status: j.task.status } : t) }));
    } catch {
      onOfflineTick(cell.id, !cell.installed);
    }
    onChanged();
  }

  async function setAllInRow(task: GridTask, value: boolean) {
    const cells = Object.values(task.cells);
    await Promise.all(cells.map(c => fetch(`/api/dimensions/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installed: value }),
    }).catch(() => onOfflineTick(c.id, value))));
    load(); onChanged();
  }

  async function saveTaskName(id: number, name: string) {
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    setEditTask(null); load();
  }

  async function editTaskBoq(t: GridTask) {
    const v = await appPrompt('BOQCODE (duy nhất toàn hệ thống, để trống = xoá mã)', t.boqCode ?? '', { mono: true });
    if (v === null) return;
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boqCode: v }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    load();
  }

  async function editTaskDrawing(t: GridTask) {
    const v = await appPrompt('Link bản vẽ / BBNT (để trống = xoá)', t.drawingUrl ?? '');
    if (v === null) return;
    await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drawingUrl: v.trim() || null }),
    });
    load();
  }

  function toggleSelect(id: number) {
    setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function saveDates(ids: number[], start: string, end: string) {
    const body: Record<string, string> = {};
    if (start) body.startDate = start;
    if (end) body.endDate = end;
    if (!Object.keys(body).length) { setDatesTarget(null); return; }
    const results = await Promise.all(ids.map(id => fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.ok).catch(() => false)));
    const failed = results.filter(ok => !ok).length;
    if (failed) appAlert(`Không lưu được ngày cho ${failed}/${ids.length} task — thử lại sau.`);
    setDatesTarget(null); setSelected(new Set()); load(); onChanged();
  }

  async function setDelayReason(t: GridTask, reason: string) {
    let note: string | null = null;
    if (reason === 'khac') note = await appPrompt('Ghi chú lý do trễ');
    const res = await fetch(`/api/tasks/${t.id}/delay-reason`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || null, note }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); }
    load();
  }

  async function approveTask(t: GridTask, approve: boolean) {
    if (!await appConfirm(approve ? `Duyệt nghiệm thu "${t.code} — ${t.name}"?` : `Huỷ nghiệm thu "${t.code}"?`, approve ? { confirmLabel: 'Duyệt' } : { danger: true, confirmLabel: 'Huỷ nghiệm thu' })) return;
    const res = await fetch(`/api/tasks/${t.id}/approve`, { method: approve ? 'POST' : 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function renameColumn(oldLabel: string) {
    const newLabel = await appPrompt('Đổi tên cột (áp dụng toàn sheet)', oldLabel);
    if (!newLabel || newLabel === oldLabel) return;
    await fetch('/api/dimensions/rename', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: pkg.id, oldLabel, newLabel }),
    });
    load(); onChanged();
  }

  async function addColumnAfter(afterLabel: string | null) {
    const label = await appPrompt(afterLabel ? `Tên cột mới (chèn sau "${afterLabel}")` : 'Tên cột mới (thêm vào cuối)');
    if (!label?.trim()) return;
    const res = await fetch(`/api/workpackages/${pkg.id}/dimensions/column`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), afterLabel: afterLabel ?? undefined }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function deleteTask(t: GridTask) {
    if (!await appConfirm(`Xoá task "${t.code} — ${t.name}"?\n\nToàn bộ ảnh, bình luận, lịch sử liên quan sẽ bị xoá vĩnh viễn.`, { danger: true, confirmLabel: 'Xoá task' })) return;
    const res = await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function copyTask(t: GridTask) {
    const code = await appPrompt('Mã task mới', `${t.code}_copy`, { mono: true });
    if (!code?.trim()) return;
    const name = await appPrompt('Tên task mới', `${t.name} (bản sao)`);
    if (!name?.trim()) return;
    const res = await fetch(`/api/tasks/${t.id}/copy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), afterId: t.id }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); appAlert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function moveTask(t: GridTask, direction: 'up' | 'down') {
    await fetch(`/api/tasks/${t.id}/move`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
    });
    load();
  }

  async function resetTaskDates(t: GridTask) {
    await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: null, endDate: null }),
    });
    load(); onChanged();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Khi chưa mở hoặc chưa tải xong lưới, chỉ hiển thị hàng tiêu đề nhóm.
  const showTable = expanded && grid && grid.columns.length > 0;
  const noData = expanded && grid && grid.columns.length === 0;

  // Chiều rộng cột — định nghĩa 1 chỗ, dùng chung cho hàng nhóm lẫn bảng task
  const W_BOQ  = 110;
  const W_CODE = 80;
  const W_NAME = isMobile ? 150 : 280;
  const W_PCT  = 56;
  // 44px = tối thiểu theo Apple/Google HIG — ngón tay bấm được dễ dàng ngoài công trường
  const W_DIM  = 44;
  const W_ACT  = 88;
  // Sticky left offset tính tự động từ các hằng số trên
  const LEFT_CODE = W_BOQ;
  const LEFT_NAME = W_BOQ + W_CODE;
  const LEFT_PCT  = W_BOQ + W_CODE + W_NAME;
  const stkBoq  = isMobile ? '' : 'sticky';
  const stkCode = isMobile ? '' : 'sticky';
  const stkName = isMobile ? 'sticky' : 'sticky';
  const stkPct  = isMobile ? '' : 'sticky';

  return (
    <div className={`overflow-auto${expanded ? ' max-h-[70vh]' : ''}`}>
      {/* Thanh bulk-action — hiển thị khi đang chọn nhiều task */}
      {canEdit && selected.size > 0 && (
        <div className="sticky top-0 left-0 z-30 flex flex-wrap items-center gap-2 bg-zinc-950 border-b border-emerald-900 px-3 py-2 text-xs">
          <span className="text-emerald-400 font-medium">{selected.size} task đã chọn</span>
          <button onClick={() => setDatesTarget({ ids: [...selected], init: { start: '', end: '' } })}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-2 py-1 text-zinc-300">
            <CalendarDays className="w-3.5 h-3.5" /> Đặt ngày
          </button>
          <button onClick={() => setSelected(new Set())} className="text-zinc-500 hover:text-zinc-300 ml-auto">Bỏ chọn</button>
        </div>
      )}

      {/* ── Bảng duy nhất: hàng nhóm + header cột + task rows ── */}
      <table className="text-xs border-collapse table-fixed" style={{ width: 'max-content', minWidth: '100%' }}>
        <colgroup>
          <col style={{ width: W_BOQ }} />
          <col style={{ width: W_CODE }} />
          <col style={{ width: W_NAME }} />
          <col style={{ width: W_PCT }} />
          {grid?.columns.map(col => <col key={col} style={{ width: W_DIM }} />)}
          {showTable && canEdit && <col style={{ width: W_ACT }} />}
        </colgroup>
        <thead>
          {/* ── Hàng tiêu đề nhóm ── */}
          <tr className="bg-zinc-900 hover:bg-zinc-800 border-b border-zinc-800 cursor-pointer select-none group">
            {/* Cột BOQ */}
            <td className={`${stkBoq} z-20 bg-inherit border-r border-zinc-800 px-2 py-3.5 align-middle`}
              style={{ left: 0, width: W_BOQ, minWidth: W_BOQ }}
              onClick={onToggle}>
              <div className="flex items-center gap-1">
                {expanded
                  ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
                <span className="font-mono text-xs text-emerald-400 truncate flex-1"
                  title={`BOQCODE: ${pkg.boqCode ?? pkg.code} (mã Excel: ${pkg.code})`}>
                  {pkg.boqCode ?? pkg.code}
                </span>
                {canEdit && (
                  <button onClick={e => { e.stopPropagation(); editPkgBoq(); }} title="Sửa BOQCODE"
                    className="text-zinc-700 hover:text-amber-400 shrink-0"><Pencil className="w-3 h-3" /></button>
                )}
              </div>
            </td>

            {/* Cột Tầng/Mã */}
            <td className={`${stkCode} z-20 bg-inherit border-r border-zinc-800 px-1 py-3.5 text-center align-middle`}
              style={{ left: LEFT_CODE, width: W_CODE, minWidth: W_CODE }}
              onClick={onToggle}>
              <span className="text-xs text-zinc-500">{pkg.floorLabel ?? ''}</span>
            </td>

            {/* Cột Tên nhóm */}
            <td className={`${stkName} z-20 bg-inherit border-r border-zinc-800 px-2 py-3.5 align-middle overflow-hidden`}
              style={{ left: isMobile ? 0 : LEFT_NAME, width: W_NAME, minWidth: W_NAME, maxWidth: W_NAME }}
              onClick={e => { if (!(e.target as Element).closest('button,input,a')) onToggle(); }}>
              {editName !== null ? (
                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePkgName(editName); if (e.key === 'Escape') setEditName(null); }}
                    className="bg-zinc-800 border border-emerald-600 rounded px-2 py-1 text-sm flex-1 outline-none" />
                  <button onClick={() => savePkgName(editName)} className="text-emerald-400"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditName(null)} className="text-zinc-500"><X className="w-4 h-4" /></button>
                </span>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm font-medium truncate flex-1">{pkg.name}</span>
                  {canEdit && editName === null && (
                    <button onClick={e => { e.stopPropagation(); setEditName(pkg.name); }} title="Sửa tên nhóm"
                      className="text-zinc-700 hover:text-emerald-400 shrink-0"><Pencil className="w-3 h-3" /></button>
                  )}
                  {(pkg.drawingUrl || canEdit) && editName === null && (
                    pkg.drawingUrl ? (
                      <span className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <a href={pkg.drawingUrl} target="_blank" rel="noreferrer" title={`Bản vẽ: ${pkg.drawingUrl}`}
                          className="text-sky-400 hover:text-sky-300"><Link2 className="w-3.5 h-3.5" /></a>
                        {canEdit && <button onClick={() => editPkgDrawing()} className="text-zinc-600 hover:text-emerald-400 ml-0.5"><Pencil className="w-2.5 h-2.5" /></button>}
                      </span>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); editPkgDrawing(); }} title="Thêm link bản vẽ / BBNT"
                        className="text-zinc-700 hover:text-sky-400 shrink-0"><Link2 className="w-3.5 h-3.5" /></button>
                    )
                  )}
                </div>
              )}
            </td>

            {/* Cột % */}
            <td className={`${stkPct} z-20 bg-inherit border-r border-zinc-800 px-1 py-3.5 text-center align-middle`}
              style={{ left: LEFT_PCT, width: W_PCT, minWidth: W_PCT }}
              onClick={onToggle}>
              <span className="text-sm font-semibold text-zinc-300">{Math.round((pkg.progress ?? 0) * 100)}%</span>
            </td>

            {/* Phần cuộn: ngày, task count, thanh tiến độ, trạng thái, nút hành động */}
            <td colSpan={showTable && grid ? grid.columns.length + (canEdit ? 1 : 0) : undefined}
              className="px-3 py-3.5 align-middle" style={{ minWidth: 520 }}
              onClick={e => { if (!(e.target as Element).closest('button,a')) onToggle(); }}>
              <div className="flex items-center gap-3">
                <button onClick={e => { e.stopPropagation(); if (canEdit) setShowDatesModal(true); }}
                  title={canEdit ? 'Sửa ngày nhóm' : `${pkg.startDate ?? '?'} → ${pkg.endDate ?? '?'}`}
                  className={`flex items-center gap-1 text-[13px] shrink-0 ${canEdit ? 'hover:text-emerald-400 cursor-pointer' : 'cursor-default'}`}>
                  <span className="w-14 text-center text-zinc-500">{fmtShortDate(pkg.startDate)}</span>
                  <span className="w-1.5 text-zinc-700">|</span>
                  <span className="w-[67px] text-center text-zinc-600">
                    {diffDays(pkg.startDate, pkg.endDate) != null
                      ? `${diffDays(pkg.startDate, pkg.endDate)}n`
                      : <CalendarDays className="w-[14px] h-[14px] text-zinc-700 inline" />}
                  </span>
                  <span className="w-1.5 text-zinc-700">|</span>
                  <span className="w-14 text-center text-zinc-500">{fmtShortDate(pkg.endDate)}</span>
                </button>
                <span className="text-[13px] text-zinc-500 w-[67px] text-right shrink-0">{pkg.tasks.length} task</span>
                <div className="flex items-center gap-2 w-44 shrink-0">
                  <div className="bg-zinc-800 rounded-full h-2 flex-1">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(pkg.progress ?? 0) * 100}%` }} />
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded text-[13px] w-32 text-center shrink-0 ${STATUS_CLS[pkg.status] ?? STATUS_CLS.chuan_bi}`}>
                  {STATUS_LABEL[pkg.status] ?? pkg.status}
                </span>
                {canEdit && (
                  <span className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => movePkg('up')} title="Di chuyển lên" disabled={pkgIdx === 0}
                      className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"><ChevronUp className="w-[17px] h-[17px]" /></button>
                    <button onClick={() => movePkg('down')} title="Di chuyển xuống" disabled={pkgIdx === pkgCount - 1}
                      className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"><ChevronDownIcon className="w-[17px] h-[17px]" /></button>
                    <button onClick={() => copyPkg()} title="Sao chép nhóm này"
                      className="p-0.5 text-zinc-600 hover:text-sky-400"><Copy className="w-[17px] h-[17px]" /></button>
                    <button onClick={() => deletePkg()} title="Xoá nhóm này"
                      className="p-0.5 text-zinc-600 hover:text-red-400"><Trash2 className="w-[17px] h-[17px]" /></button>
                  </span>
                )}
              </div>
            </td>
          </tr>

          {/* ── Hàng header cột (chỉ khi mở và có dữ liệu) ── */}
          {showTable && (
            <tr className="bg-zinc-950">
              <th className={`${stkBoq} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-500 font-medium`}
                style={{ left: 0 }}>BOQ</th>
              <th className={`${stkCode} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-500 font-medium`}
                style={{ left: LEFT_CODE }}>Mã</th>
              <th className={`${stkName} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-500 font-medium`}
                style={{ left: isMobile ? 0 : LEFT_NAME }}>Công việc</th>
              <th className={`${stkPct} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-500 font-medium`}
                style={{ left: LEFT_PCT }}>%</th>
              {grid.columns.map(col => (
                <th key={col} className="border-b border-zinc-800 p-0 overflow-hidden align-middle" style={{ width: W_DIM }}>
                  <div className="flex items-center justify-center" style={{ height: 88 }}>
                    <div className="text-[10px] text-zinc-500 hover:text-emerald-400 cursor-default overflow-hidden"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 84, lineHeight: '1.2' }}
                      title={canEdit ? `${col} — bấm để đổi tên` : col}
                      onClick={() => canEdit && renameColumn(col)}>{col}</div>
                  </div>
                </th>
              ))}
              {canEdit && (
                <th className="border-b border-zinc-800 align-bottom pb-2 text-center" style={{ width: W_ACT }}>
                  <button onClick={() => addColumnAfter(grid.columns[grid.columns.length - 1] ?? null)}
                    title="Thêm cột mới vào cuối"
                    className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-emerald-400 hover:bg-emerald-950/40 rounded mx-auto">
                    <Columns className="w-3 h-3" />
                  </button>
                </th>
              )}
            </tr>
          )}
        </thead>

        {/* Thông báo loading / no data */}
        {expanded && !grid && (
          <tbody><tr><td colSpan={4} className="px-4 py-3 text-sm text-zinc-500">Đang tải lưới...</td></tr></tbody>
        )}
        {noData && (
          <tbody><tr><td colSpan={4} className="px-4 py-3 text-sm text-zinc-500">Nhóm này chưa có dữ liệu lưới. {grid.tasks.length} task.</td></tr></tbody>
        )}

        {showTable && (
        <tbody>
            {grid.tasks.map((t, ti) => (
              <Fragment key={t.id}>
              <tr className="hover:bg-zinc-800/30 transition-colors">
                <td className={`${stkBoq} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 text-center align-top overflow-hidden`}
                  style={{ left: 0 }}>
                  <button onClick={() => canEdit && editTaskBoq(t)}
                    title={canEdit ? `${t.boqCode ?? 'Chưa gán'} — bấm để sửa` : t.boqCode ?? 'Chưa gán'}
                    className={`font-mono text-[10px] truncate block w-full text-center ${canEdit ? 'text-amber-400 hover:underline cursor-pointer' : 'text-amber-400/70 cursor-default'}`}>
                    {t.boqCode ?? '—'}
                  </button>
                  {(t.drawingUrl || canEdit) && (
                    t.drawingUrl ? (
                      <span className="flex items-center justify-center gap-0.5 mt-0.5">
                        <a href={t.drawingUrl} target="_blank" rel="noreferrer" title={`Bản vẽ: ${t.drawingUrl}`}
                          className="text-sky-400 hover:text-sky-300"><Link2 className="w-3 h-3" /></a>
                        {canEdit && <button onClick={() => editTaskDrawing(t)} className="text-zinc-600 hover:text-emerald-400"><Pencil className="w-2.5 h-2.5" /></button>}
                      </span>
                    ) : (
                      <button onClick={() => editTaskDrawing(t)} title="Thêm link bản vẽ / BBNT"
                        className="block mx-auto mt-0.5 text-zinc-700 hover:text-sky-400"><Link2 className="w-3 h-3" /></button>
                    )
                  )}
                </td>
                <td className={`${stkCode} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 text-center align-top overflow-hidden`}
                  style={{ left: LEFT_CODE }}>
                  <div className="flex items-center justify-center gap-1">
                    {canEdit && (
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                        title="Chọn để gán/đặt ngày hàng loạt"
                        className="w-3 h-3 accent-emerald-500 cursor-pointer shrink-0" />
                    )}
                    <span className="font-mono text-zinc-400 text-[10px]">{t.code}</span>
                  </div>
                </td>
                <td className={`${stkName} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 overflow-hidden`}
                  style={{ left: isMobile ? 0 : LEFT_NAME, width: W_NAME, minWidth: W_NAME, maxWidth: W_NAME }}>
                  {editTask?.id === t.id ? (
                    <span className="flex items-center gap-1">
                      <input autoFocus value={editTask.value} onChange={e => setEditTask({ id: t.id, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveTaskName(t.id, editTask.value); if (e.key === 'Escape') setEditTask(null); }}
                        className="bg-zinc-800 border border-emerald-600 rounded px-1 py-0.5 text-xs w-full outline-none" />
                      <button onClick={() => saveTaskName(t.id, editTask.value)} className="text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="truncate flex-1" title={t.name}>{t.name}</span>
                      {canEdit && <button onClick={() => setEditTask({ id: t.id, value: t.name })} className="shrink-0 text-zinc-600 hover:text-emerald-400"><Pencil className="w-3 h-3" /></button>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {(() => {
                      const effStart = t.startDate ?? pkg.startDate;
                      const effEnd = t.endDate ?? pkg.endDate;
                      const inherited = !t.startDate && !!pkg.startDate;
                      return (
                        <span className="flex items-center gap-1">
                          <button onClick={() => canEdit && setDatesTarget({ ids: [t.id], init: { start: t.startDate ?? '', end: t.endDate ?? '' } })}
                            title={canEdit ? (inherited ? 'Kế thừa từ nhóm — bấm để đặt ngày riêng' : 'Sửa ngày bắt đầu / kết thúc') : `${effStart ?? '?'} → ${effEnd ?? '?'}`}
                            className={`flex items-center gap-0.5 text-[10px] whitespace-nowrap ${t.status === 'tre' ? 'text-red-400' : inherited ? 'text-zinc-500 italic' : 'text-zinc-400'} ${canEdit ? 'hover:text-emerald-400 hover:underline cursor-pointer' : 'cursor-default'}`}>
                            <CalendarDays className="w-3 h-3 shrink-0" /> {fmtShortDate(effStart)}→{fmtShortDate(effEnd)}{inherited && ' ↑'}
                          </button>
                          {t.startDate && canEdit && (
                            <button onClick={() => resetTaskDates(t)} title="Về kế thừa ngày từ nhóm"
                              className="text-zinc-700 hover:text-amber-400 shrink-0"><RotateCcw className="w-3 h-3" /></button>
                          )}
                        </span>
                      );
                    })()}
                    <button onClick={() => setAllInRow(t, true)} className="text-[10px] text-emerald-500 hover:underline">Tất cả</button>
                    <button onClick={() => setAllInRow(t, false)} className="text-[10px] text-zinc-500 hover:underline">Bỏ</button>
                    <button onClick={() => setHistoryTask(t)} title="Lịch sử tiến độ"
                      className="text-zinc-600 hover:text-emerald-400"><History className="w-3 h-3" /></button>
                    <button onClick={() => setPhotosTask(t)} title="Ảnh hiện trường"
                      className={`flex items-center gap-0.5 ${t.photoCount > 0 ? 'text-sky-400 hover:text-sky-300' : 'text-zinc-600 hover:text-sky-400'}`}>
                      <Camera className="w-3 h-3" />{t.photoCount > 0 && <span className="text-[10px]">{t.photoCount}</span>}
                    </button>
                    <button onClick={() => setCommentsTask(t)} title="Bình luận / trao đổi"
                      className={`flex items-center gap-0.5 ${t.commentCount > 0 ? 'text-violet-400 hover:text-violet-300' : 'text-zinc-600 hover:text-violet-400'}`}>
                      <MessageSquare className="w-3 h-3" />{t.commentCount > 0 && <span className="text-[10px]">{t.commentCount}</span>}
                    </button>
                    {t.status === 'nghiem_thu' ? (
                      <span className="flex items-center gap-1 text-[10px] text-teal-300 bg-teal-950 px-1.5 py-0.5 rounded">
                        ✓ Đã NT
                        {canEdit && <button onClick={() => approveTask(t, false)} title="Huỷ nghiệm thu" className="text-teal-500 hover:text-red-400"><X className="w-2.5 h-2.5" /></button>}
                      </span>
                    ) : canEdit && t.progressPercent >= 1 && (
                      <button onClick={() => approveTask(t, true)} title="Duyệt nghiệm thu (task đã 100%)"
                        className="text-[10px] text-teal-400 border border-teal-800 bg-teal-950/50 hover:bg-teal-900/60 px-1.5 py-0.5 rounded">Nghiệm thu</button>
                    )}
                    {t.status === 'tre' && (
                      <select value={t.delayReason ?? ''} onChange={e => setDelayReason(t, e.target.value)}
                        title="Nguyên nhân trễ — giúp PM thống kê và xử lý"
                        className={`text-[10px] rounded px-1 py-0.5 outline-none border max-w-[110px] ${t.delayReason
                          ? 'bg-red-950/60 border-red-900 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
                        <option value="">— Lý do trễ? —</option>
                        {Object.entries(DELAY_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    )}
                  </div>
                </td>
                <td className={`${stkPct} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-1 py-1 text-center align-top overflow-hidden`}
                  style={{ left: LEFT_PCT }}>
                  <span className={Math.round(t.progressPercent * 100) === 100 ? 'text-emerald-400' : 'text-zinc-300'}>{Math.round((t.progressPercent ?? 0) * 100)}%</span>
                </td>
                {grid.columns.map(col => {
                  const cell = t.cells[col];
                  return (
                    <td key={col} className="border-b border-zinc-800/60 text-center align-middle p-0">
                      {cell ? (
                        <label className="flex items-center justify-center w-full h-full min-h-[44px] cursor-pointer">
                          <input type="checkbox" checked={cell.installed} onChange={() => toggle(cell, t, col)}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                        </label>
                      ) : <span className="flex items-center justify-center min-h-[44px] text-zinc-700">·</span>}
                    </td>
                  );
                })}
                {canEdit && (
                  <td className="border-b border-zinc-800/60 text-center align-middle p-1 w-[88px] min-w-[88px]">
                    <div className="flex justify-center items-center gap-0.5">
                      <button onClick={() => moveTask(t, 'up')} disabled={ti === 0} title="Lên"
                        className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
                      <button onClick={() => moveTask(t, 'down')} disabled={ti === grid.tasks.length - 1} title="Xuống"
                        className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20"><ChevronDownIcon className="w-3 h-3" /></button>
                      <button onClick={() => copyTask(t)} title="Sao chép task"
                        className="text-zinc-700 hover:text-sky-400"><Copy className="w-3 h-3" /></button>
                      <button onClick={() => deleteTask(t)} title="Xoá task"
                        className="text-zinc-700 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                )}
              </tr>
              </Fragment>
            ))}
          </tbody>
        )}
      </table>

      {historyTask && <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />}
      {photosTask && <PhotosModal task={photosTask} onClose={() => { setPhotosTask(null); load(); }} />}
      {commentsTask && <CommentsModal task={commentsTask} onClose={() => { setCommentsTask(null); load(); }} />}
      {datesTarget && <DatesModal target={datesTarget} onSave={saveDates} onClose={() => setDatesTarget(null)} />}
      {showDatesModal && <PkgDatesModal pkg={pkg} onSave={savePkgDates} onClose={() => setShowDatesModal(false)} />}
    </div>
  );
}

type HistoryItem = {
  id: number; oldProgress: number | null; newProgress: number | null;
  status: string | null; note: string | null; changedBy: string | null; changedAt: string;
};

type Photo = {
  id: number; originalName: string | null; mimeType: string; sizeBytes: number;
  caption: string | null; createdAt: string; uploadedBy: number | null; uploaderName: string | null;
};

// Gallery ảnh hiện trường của task: xem, upload (chụp từ mobile), xoá.
function PhotosModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tasks/${task.id}/photos`).then(r => r.json()).then(j => setPhotos(j.photos ?? []));
  }, [task.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => j && setMe({ id: j.user.id, role: j.user.role }));
  }, []);

  async function upload(file: File) {
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    const caption = await appPrompt('Ghi chú cho ảnh (tuỳ chọn)', '', { placeholder: 'VD: đã lắp xong nhánh trục 24F' }) ?? '';
    if (caption.trim()) fd.append('caption', caption.trim());
    const res = await fetch(`/api/tasks/${task.id}/photos`, { method: 'POST', body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Upload thất bại');
    }
    setUploading(false); load();
  }

  async function remove(p: Photo) {
    if (!await appConfirm('Xoá ảnh này?', { danger: true, confirmLabel: 'Xoá ảnh' })) return;
    const res = await fetch(`/api/photos/${p.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Không xoá được'); return; }
    load();
  }

  const canDelete = (p: Photo) => me && (p.uploadedBy === me.id || me.role === 'admin' || me.role === 'pm');

  return (
    <Modal onClose={onClose} className="max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <Camera className="w-4 h-4 text-sky-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">Ảnh hiện trường — {task.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{task.code} · {photos?.length ?? 0} ảnh</p>
          </div>
          <label className="ml-auto shrink-0 flex items-center gap-1.5 bg-sky-900/60 hover:bg-sky-800/60 border border-sky-800 text-sky-200 px-3 py-1.5 rounded-lg text-xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> {uploading ? 'Đang tải lên...' : 'Thêm ảnh'}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </label>
          <button onClick={onClose} className="text-zinc-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-4">
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          {photos === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {photos?.length === 0 && (
            <p className="text-sm text-zinc-500">Chưa có ảnh nào. Chụp ảnh hiện trường làm bằng chứng thi công/nghiệm thu.</p>
          )}
          {!!photos?.length && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map(p => (
                <div key={p.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photos/${p.id}`} alt={p.caption ?? p.originalName ?? `Ảnh #${p.id}`}
                    className="w-full h-32 object-cover cursor-zoom-in" loading="lazy" onClick={() => setViewer(p)} />
                  <div className="px-2 py-1.5 flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      {p.caption && <p className="text-xs truncate" title={p.caption}>{p.caption}</p>}
                      <p className="text-[10px] text-zinc-500 truncate">
                        {p.uploaderName ?? '—'} · {new Date(p.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    {canDelete(p) && (
                      <button onClick={() => remove(p)} title="Xoá ảnh"
                        className="text-zinc-600 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      {viewer && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setViewer(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${viewer.id}`} alt={viewer.caption ?? ''} className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </Modal>
  );
}

// Modal sửa ngày bắt đầu / kết thúc cho toàn nhóm công việc.
function PkgDatesModal({ pkg, onSave, onClose }: {
  pkg: Pkg;
  onSave: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(pkg.startDate ?? '');
  const [end, setEnd] = useState(pkg.endDate ?? '');
  const [saving, setSaving] = useState(false);
  const invalid = !!start && !!end && end < start;
  const days = (() => {
    if (!start || !end) return null;
    const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
    return d >= 0 ? d + 1 : null;
  })();

  return (
    <Modal onClose={onClose} className="max-w-sm">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-sm">Ngày thi công — {pkg.code}</h3>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-zinc-400">Ngày bắt đầu</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Ngày kết thúc</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]" />
          </div>
          {days != null && (
            <p className="text-xs text-zinc-400 text-center">⏱ <b className="text-white">{days}</b> ngày thi công</p>
          )}
          {invalid && <p className="text-xs text-red-400">Ngày kết thúc phải sau ngày bắt đầu.</p>}
          <p className="text-[11px] text-zinc-500">Task con chưa có ngày riêng sẽ hiển thị ngày này (kế thừa).</p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setSaving(true); onSave(start, end); }}
              disabled={saving || invalid}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg py-2 text-sm font-medium transition">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button onClick={onClose} className="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">Huỷ</button>
          </div>
        </div>
    </Modal>
  );
}

function DatesModal({ target, onSave, onClose }: {
  target: { ids: number[]; init: { start: string; end: string } };
  onSave: (ids: number[], start: string, end: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(target.init.start);
  const [end, setEnd] = useState(target.init.end);
  const [saving, setSaving] = useState(false);
  const bulk = target.ids.length > 1;
  const invalid = !!start && !!end && end < start;

  return (
    <Modal onClose={onClose} className="max-w-sm">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <h3 className="font-semibold text-sm">📅 {bulk ? `Đặt ngày cho ${target.ids.length} task` : 'Sửa ngày bắt đầu / kết thúc'}</h3>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {bulk && <p className="text-xs text-zinc-500">Ô để trống sẽ giữ nguyên ngày hiện tại của từng task.</p>}
          <div>
            <label className="text-xs text-zinc-400">Ngày bắt đầu</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Ngày kết thúc (deadline)</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]" />
          </div>
          {invalid && <p className="text-xs text-red-400">Ngày kết thúc phải sau ngày bắt đầu.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setSaving(true); onSave(target.ids, start, end); }}
              disabled={saving || invalid || (!start && !end)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg py-2 text-sm font-medium transition">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button onClick={onClose} className="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">Huỷ</button>
          </div>
        </div>
    </Modal>
  );
}

type Comment = {
  id: number; body: string; createdAt: string;
  userId: number | null; userName: string | null; userRole: string | null;
};

const ROLE_BADGE: Record<string, string> = { admin: 'Admin', pm: 'PM', engineer: 'Kỹ sư', subcon: 'Thầu phụ' };

// Trao đổi trên task: PM hỏi — người thi công trả lời ngay trong app.
function CommentsModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tasks/${task.id}/comments`).then(r => r.json()).then(j => setComments(j.comments ?? []));
  }, [task.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => j && setMe({ id: j.user.id, role: j.user.role }));
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError('');
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Gửi thất bại'); }
    else setDraft('');
    setSending(false); load();
  }

  async function remove(c: Comment) {
    if (!await appConfirm('Xoá bình luận này?', { danger: true, confirmLabel: 'Xoá' })) return;
    await fetch(`/api/comments/${c.id}`, { method: 'DELETE' });
    load();
  }

  const canDelete = (c: Comment) => me && (c.userId === me.id || me.role === 'admin' || me.role === 'pm');

  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">Trao đổi — {task.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{task.code}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-4 flex-1 space-y-3">
          {comments === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {comments?.length === 0 && <p className="text-sm text-zinc-500">Chưa có trao đổi nào. Đặt câu hỏi hoặc báo cáo vướng mắc tại đây.</p>}
          {comments?.map(c => (
            <div key={c.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 group">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-violet-300">{c.userName ?? '—'}</span>
                {c.userRole && <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">{ROLE_BADGE[c.userRole] ?? c.userRole}</span>}
                <span className="text-zinc-600">{new Date(c.createdAt).toLocaleString('vi-VN')}</span>
                {canDelete(c) && (
                  <button onClick={() => remove(c)} title="Xoá"
                    className="ml-auto text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3 h-3" /></button>
                )}
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-zinc-800 p-3">
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={2000}
              placeholder="Viết bình luận... (Ctrl+Enter để gửi)"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
              className="bg-zinc-950 border border-zinc-800 focus:border-violet-600 rounded-lg px-3 py-2 text-sm flex-1 outline-none resize-none" />
            <button onClick={send} disabled={!draft.trim() || sending} title="Gửi"
              className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 self-end py-2.5">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
    </Modal>
  );
}

function HistoryModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/history`).then(r => r.json()).then(j => setItems(j.history ?? []));
  }, [task.id]);

  const pct = (v: number | null) => `${Math.round((v ?? 0) * 100)}%`;

  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{task.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{task.code} · hiện tại {pct(task.progressPercent)}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-4">
          {items === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {items?.length === 0 && <p className="text-sm text-zinc-500">Chưa có thay đổi nào được ghi nhận.</p>}
          {!!items?.length && (
            <ol className="relative border-l border-zinc-800 ml-1.5 space-y-4">
              {items.map(h => {
                const up = (h.newProgress ?? 0) >= (h.oldProgress ?? 0);
                return (
                  <li key={h.id} className="ml-4">
                    <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${up ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <p className="text-sm">
                      <span className="text-zinc-400">{pct(h.oldProgress)}</span>
                      <span className="text-zinc-600"> → </span>
                      <span className={up ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>{pct(h.newProgress)}</span>
                      {h.status && <span className="ml-2 px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400">{STATUS_LABEL[h.status] ?? h.status}</span>}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {h.changedBy ?? '—'} · {new Date(h.changedAt).toLocaleString('vi-VN')}
                      {h.note && <span className="text-zinc-600"> · {h.note}</span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
    </Modal>
  );
}
