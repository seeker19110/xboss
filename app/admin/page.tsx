'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ShieldCheck, ChevronRight, ChevronDown, RotateCcw,
  Users, AlertCircle, History, Filter, ChevronsUpDown, ChevronsDown,
} from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';

type User = { id: number; name: string; role: string };
type Sheet = { id: number; code: string; name: string; slug: string; managerId: number | null; managerName: string | null };
type Pkg = { id: number; sheetId: number; code: string; name: string; floorLabel: string | null; assignedTo: number | null; assignedManual: boolean; assigneeName: string | null };
type Task = { id: number; packageId: number; code: string; name: string; assignedTo: number | null; assignedManual: boolean; assigneeName: string | null };
type Workload = Record<number, { total: number; delayed: number }>;
type AuditRow = { id: number; level: string; targetLabel: string; isManual: boolean; changedAt: string; prevUser: string | null; newUser: string | null; changedBy: string | null };

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', pm: 'PM', engineer: 'Kỹ sư', subcon: 'Thầu phụ' };
const LEVEL_LABEL: Record<string, string> = { sheet: 'Hệ', package: 'Nhóm', task: 'Task' };

function fmtDt(s: string) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AdminPage() {
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [tab, setTab] = useState<'assign' | 'audit'>('assign');
  const [users, setUsers] = useState<User[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workload, setWorkload] = useState<Workload>({});
  const [openSheets, setOpenSheets] = useState<Set<number>>(new Set());
  const [openPkgs, setOpenPkgs] = useState<Set<number>>(new Set());
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  // audit
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_LIMIT = 30;

  const loadAssign = useCallback((unassignedOnly = false) => {
    const q = unassignedOnly ? '?unassignedOnly=1' : '';
    fetch(`/api/admin/assignments${q}`).then(r => r.json()).then(j => {
      setSheets(j.sheets ?? []); setPackages(j.packages ?? []);
      setTasks(j.tasks ?? []); setWorkload(j.workload ?? {});
    });
  }, []);

  const loadAudit = useCallback((page = 0) => {
    fetch(`/api/admin/audit?limit=${AUDIT_LIMIT}&offset=${page * AUDIT_LIMIT}`)
      .then(r => r.json()).then(j => { setAudit(j.rows ?? []); setAuditTotal(j.total ?? 0); });
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setMe(j.user);
      if (j.user?.role === 'admin' || j.user?.role === 'pm') {
        fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? []));
        loadAssign();
      }
    });
  }, [loadAssign]);

  useEffect(() => {
    if (tab === 'audit') loadAudit(auditPage);
  }, [tab, auditPage, loadAudit]);

  function flash(msg: string) { setOkMsg(msg); setError(''); setTimeout(() => setOkMsg(''), 3000); }

  async function assign(level: 'sheet' | 'package' | 'task', id: number, userId: number | null, label: string) {
    const res = await fetch('/api/admin/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, id, userId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Lỗi không xác định'); return; }
    flash(userId === null
      ? (level === 'sheet' ? `Đã bỏ quản lý ${label}` : `${label} trở về kế thừa`)
      : `Đã phân công ${label}`);
    loadAssign(filterUnassigned);
  }

  function toggleFilter() {
    const next = !filterUnassigned;
    setFilterUnassigned(next);
    loadAssign(next);
    // Mở rộng tất cả khi lọc chưa gán để dễ xử lý.
    if (next) {
      setOpenSheets(new Set(sheets.map(s => s.id)));
      setOpenPkgs(new Set(packages.map(p => p.id)));
    }
  }

  function expandAll() {
    setOpenSheets(new Set(sheets.map(s => s.id)));
    setOpenPkgs(new Set(packages.map(p => p.id)));
  }
  function collapseAll() { setOpenSheets(new Set()); setOpenPkgs(new Set()); }

  function toggle(set: Set<number>, id: number, fn: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    fn(next);
  }

  // Tính minWidth của badge workload từ giá trị lớn nhất trong tất cả các hàng,
  // giúp cột căn đều dù số task/trễ chênh lệch nhiều.
  const wlBadgeMinW = useMemo(() => {
    const vals = Object.values(workload);
    if (!vals.length) return undefined;
    const maxTotal = Math.max(...vals.map(w => w.total));
    const maxDelayed = Math.max(...vals.map(w => w.delayed));
    const sample = `${maxTotal} task${maxDelayed > 0 ? ` · ${maxDelayed} trễ` : ''}`;
    return `${sample.length * 6 + 16}px`; // ~6px/ký tự ở text-[11px] + padding
  }, [workload]);

  function WorkloadBadge({ userId }: { userId: number | null }) {
    if (!userId) return null;
    const wl = workload[userId];
    if (!wl) return null;
    return (
      <span style={{ minWidth: wlBadgeMinW }}
        className="flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-zinc-800 text-zinc-400 shrink-0">
        {wl.total} task
        {wl.delayed > 0 && <span className="text-red-400 font-semibold">· {wl.delayed} trễ</span>}
      </span>
    );
  }

  function UserSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    return (
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm w-[200px] shrink-0"
      >
        <option value="">— Kế thừa / chưa gán —</option>
        {users.map(u => {
          const wl = workload[u.id];
          const suffix = wl ? ` [${wl.total}${wl.delayed > 0 ? `·${wl.delayed}⚠` : ''}]` : '';
          return <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role] ?? u.role}){suffix}</option>;
        })}
      </select>
    );
  }

  if (me && me.role !== 'admin' && me.role !== 'pm') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Chỉ Admin/PM được truy cập. <a href="/" className="text-emerald-400 hover:underline">← Dashboard</a></p>
      </div>
    );
  }

  const unassignedCount = tasks.filter(t => !t.assignedTo).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back title={<><ShieldCheck className="w-5 h-5 text-emerald-400" /> Quản trị</>} search={false}>
        <nav className="flex gap-1">
          {([['assign', 'Phân công'], ['audit', 'Lịch sử']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1 rounded text-sm ${tab === key ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>
              {key === 'audit' && <History className="w-3.5 h-3.5 inline mr-1" />}{label}
            </button>
          ))}
        </nav>
        {me?.role === 'admin' && (
          <a href="/users" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-emerald-400 shrink-0">
            <Users className="w-4 h-4" /> Người dùng
          </a>
        )}
      </AppHeader>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {error && <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded px-3 py-2">{error}</p>}
        {okMsg && <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded px-3 py-2">{okMsg}</p>}

        {/* ========== TAB PHÂN CÔNG ========== */}
        {tab === 'assign' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-zinc-400 flex-1">
                Gán người quản lý cho <b>hệ</b> — nhóm và task bên trong <b>kế thừa tự động</b>.
                Gán riêng ở cấp nhóm/task sẽ thoát kế thừa (<span className="text-amber-400">thủ công</span>);
                bấm <RotateCcw className="w-3 h-3 inline" /> để đưa về kế thừa.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={expandAll} title="Mở rộng tất cả" className="text-zinc-500 hover:text-white p-1">
                  <ChevronsDown className="w-4 h-4" />
                </button>
                <button onClick={collapseAll} title="Thu gọn tất cả" className="text-zinc-500 hover:text-white p-1">
                  <ChevronsUpDown className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleFilter}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border transition ${filterUnassigned ? 'bg-amber-950/50 border-amber-700 text-amber-400' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'}`}>
                  <Filter className="w-3.5 h-3.5" />
                  Chưa gán{unassignedCount > 0 && !filterUnassigned ? ` (${unassignedCount})` : ''}
                </button>
              </div>
            </div>

            {sheets.map(sheet => {
              const pkgs = packages.filter(p => p.sheetId === sheet.id);
              const open = openSheets.has(sheet.id);
              const sheetUnassigned = !sheet.managerId;
              return (
                <div key={sheet.id} className={`border rounded-lg overflow-hidden ${sheetUnassigned && filterUnassigned ? 'border-amber-800/50' : 'border-zinc-800'}`}>
                  <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/70 flex-wrap">
                    <button onClick={() => toggle(openSheets, sheet.id, setOpenSheets)} className="text-zinc-400 hover:text-white shrink-0">
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate flex items-center gap-2">
                        {sheet.code} — {sheet.name}
                        {sheetUnassigned && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </p>
                      <p className="text-xs text-zinc-500 flex items-center gap-2">
                        {pkgs.length} nhóm · Quản lý: {sheet.managerName ?? <span className="text-zinc-600">chưa gán</span>}
                        {sheet.managerId && <WorkloadBadge userId={sheet.managerId} />}
                      </p>
                    </div>
                    {sheet.managerId && (
                      <button title="Bỏ quản lý hệ" onClick={() => assign('sheet', sheet.id, null, `hệ ${sheet.code}`)}
                        className="text-zinc-500 hover:text-red-400 shrink-0"><RotateCcw className="w-3.5 h-3.5" /></button>
                    )}
                    <UserSelect value={sheet.managerId} onChange={v => assign('sheet', sheet.id, v, `hệ ${sheet.code}`)} />
                  </div>

                  {open && (
                    <div className="divide-y divide-zinc-800/60">
                      {pkgs.map(pkg => {
                        const pkgTasks = tasks.filter(t => t.packageId === pkg.id);
                        const pOpen = openPkgs.has(pkg.id);
                        const pkgHasUnassigned = pkgTasks.some(t => !t.assignedTo);
                        return (
                          <div key={pkg.id}>
                            <div className="flex items-center gap-3 pl-10 pr-4 py-2 bg-zinc-950 flex-wrap">
                              <button onClick={() => toggle(openPkgs, pkg.id, setOpenPkgs)} className="text-zinc-500 hover:text-white shrink-0">
                                {pOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate flex items-center gap-1.5">
                                  {pkg.code} — {pkg.name}{pkg.floorLabel ? ` (${pkg.floorLabel})` : ''}
                                  {pkgHasUnassigned && filterUnassigned && <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />}
                                </p>
                              </div>
                              {pkg.assignedManual
                                ? <span className="text-[11px] text-amber-400 border border-amber-900 rounded px-1.5 py-0.5 shrink-0">thủ công</span>
                                : <span className="text-[11px] text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5 shrink-0">kế thừa</span>}
                              {pkg.assignedManual && (
                                <button title="Về kế thừa từ quản lý hệ" onClick={() => assign('package', pkg.id, null, `nhóm ${pkg.code}`)}
                                  className="text-zinc-500 hover:text-emerald-400 shrink-0"><RotateCcw className="w-3.5 h-3.5" /></button>
                              )}
                              <WorkloadBadge userId={pkg.assignedTo} />
                              <UserSelect value={pkg.assignedTo} onChange={v => assign('package', pkg.id, v, `nhóm ${pkg.code}`)} />
                            </div>

                            {pOpen && pkgTasks.map(t => (
                              <div key={t.id} className={`flex items-center gap-3 pl-16 pr-4 py-1.5 flex-wrap ${!t.assignedTo && filterUnassigned ? 'bg-amber-950/10' : 'bg-zinc-950/60'}`}>
                                <p className="flex-1 min-w-0 text-sm text-zinc-300 truncate">{t.code} — {t.name}</p>
                                {t.assignedManual
                                  ? <span className="text-[11px] text-amber-400 border border-amber-900 rounded px-1.5 py-0.5 shrink-0">thủ công</span>
                                  : <span className="text-[11px] text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5 shrink-0">kế thừa</span>}
                                {t.assignedManual && (
                                  <button title="Về kế thừa từ nhóm" onClick={() => assign('task', t.id, null, `task ${t.code}`)}
                                    className="text-zinc-500 hover:text-emerald-400 shrink-0"><RotateCcw className="w-3.5 h-3.5" /></button>
                                )}
                                <WorkloadBadge userId={t.assignedTo} />
                                <UserSelect value={t.assignedTo} onChange={v => assign('task', t.id, v, `task ${t.code}`)} />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                      {pkgs.length === 0 && <p className="pl-10 py-3 text-sm text-zinc-500">Sheet chưa có nhóm công việc.</p>}
                    </div>
                  )}
                </div>
              );
            })}

            {sheets.length === 0 && (
              <p className="text-center text-zinc-500 py-12">
                {filterUnassigned ? 'Tất cả task đã được gán người phụ trách 🎉' : 'Chưa có sheet nào.'}
              </p>
            )}
          </>
        )}

        {/* ========== TAB LỊCH SỬ PHÂN CÔNG ========== */}
        {tab === 'audit' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Toàn bộ thay đổi phân công — ai gán ai, lúc nào. Tổng: <b className="text-white">{auditTotal}</b> bản ghi.</p>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Thời gian</th>
                    <th className="px-4 py-2 text-left">Cấp</th>
                    <th className="px-4 py-2 text-left">Đối tượng</th>
                    <th className="px-4 py-2 text-left">Trước</th>
                    <th className="px-4 py-2 text-left">Sau</th>
                    <th className="px-4 py-2 text-left">Người gán</th>
                    <th className="px-4 py-2 text-left">Loại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {audit.map(row => (
                    <tr key={row.id} className="hover:bg-zinc-900/40">
                      <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">{fmtDt(row.changedAt)}</td>
                      <td className="px-4 py-2 text-zinc-300">{LEVEL_LABEL[row.level] ?? row.level}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-200">{row.targetLabel}</td>
                      <td className="px-4 py-2 text-zinc-500">{row.prevUser ?? <span className="text-zinc-700">—</span>}</td>
                      <td className="px-4 py-2 text-emerald-400">{row.newUser ?? <span className="text-zinc-500">bỏ gán</span>}</td>
                      <td className="px-4 py-2 text-zinc-400">{row.changedBy}</td>
                      <td className="px-4 py-2">
                        {row.isManual
                          ? <span className="text-[11px] text-amber-400 border border-amber-900 rounded px-1.5 py-0.5">thủ công</span>
                          : <span className="text-[11px] text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">kế thừa</span>}
                      </td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-600">Chưa có lịch sử phân công.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Phân trang audit */}
            {auditTotal > AUDIT_LIMIT && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-zinc-500">Trang {auditPage + 1} / {Math.ceil(auditTotal / AUDIT_LIMIT)}</span>
                <button disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}
                  className="px-3 py-1 text-sm rounded border border-zinc-700 disabled:opacity-30 hover:bg-zinc-800">← Trước</button>
                <button disabled={(auditPage + 1) * AUDIT_LIMIT >= auditTotal} onClick={() => setAuditPage(p => p + 1)}
                  className="px-3 py-1 text-sm rounded border border-zinc-700 disabled:opacity-30 hover:bg-zinc-800">Sau →</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
