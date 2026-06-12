'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, FileText, Paperclip, Upload, X } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { Modal, appAlert, appConfirm } from '@/app/components/dialogs';
import { PageSkeleton } from '@/app/components/Skeleton';

type ApprovalTask = {
  id: number; boqCode: string | null; code: string; name: string; status: string;
  endDate: string | null; progressPercent: number;
  floorLabel: string | null; wpName: string; sheetType: string;
  docCount: number;
};
type Doc = {
  id: number; originalName: string | null; mimeType: string;
  sizeBytes: number; caption: string | null; uploaderName: string | null; createdAt: string;
};

const fmtSize = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

export default function ApprovalsPage() {
  const [pending, setPending] = useState<ApprovalTask[]>([]);
  const [approved, setApproved] = useState<ApprovalTask[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openDocs, setOpenDocs] = useState<number | null>(null); // task id đang xem tài liệu
  const [docs, setDocs] = useState<Doc[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTaskRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/approvals');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const j = await r.json();
    setPending(j.pending ?? []);
    setApproved(j.approved ?? []);
    setCanApprove(!!j.canApprove);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadDocs(taskId: number) {
    setOpenDocs(taskId);
    setDocs([]);
    const r = await fetch(`/api/tasks/${taskId}/documents`);
    if (r.ok) setDocs((await r.json()).documents ?? []);
  }

  function pickFile(taskId: number) {
    uploadTaskRef.current = taskId;
    fileRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const taskId = uploadTaskRef.current;
    e.target.value = '';
    if (!file || !taskId) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    const r = await fetch(`/api/tasks/${taskId}/documents`, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      appAlert(j?.error ?? 'Upload thất bại');
      return;
    }
    setPending(p => p.map(t => t.id === taskId ? { ...t, docCount: t.docCount + 1 } : t));
    setApproved(p => p.map(t => t.id === taskId ? { ...t, docCount: t.docCount + 1 } : t));
    if (openDocs === taskId) loadDocs(taskId);
  }

  async function deleteDoc(docId: number) {
    if (!await appConfirm('Xoá tài liệu này?', { danger: true, confirmLabel: 'Xoá' })) return;
    const r = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    if (!r.ok) { appAlert((await r.json().catch(() => null))?.error ?? 'Không xoá được'); return; }
    setDocs(d => d.filter(x => x.id !== docId));
    if (openDocs !== null) {
      setPending(p => p.map(t => t.id === openDocs ? { ...t, docCount: Math.max(0, t.docCount - 1) } : t));
      setApproved(p => p.map(t => t.id === openDocs ? { ...t, docCount: Math.max(0, t.docCount - 1) } : t));
    }
  }

  async function approveSelected() {
    if (selected.size === 0) return;
    if (!await appConfirm(`Duyệt nghiệm thu ${selected.size} công việc?`, { confirmLabel: 'Duyệt' })) return;
    setBusy(true);
    const r = await fetch('/api/approvals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: [...selected] }),
    });
    setBusy(false);
    if (!r.ok) { appAlert((await r.json().catch(() => null))?.error ?? 'Duyệt thất bại'); return; }
    const j = await r.json();
    if (j.skipped?.length) appAlert(`Bỏ qua ${j.skipped.length} task:\n` + j.skipped.map((s: { id: number; reason: string }) => `#${s.id}: ${s.reason}`).join('\n'));
    setSelected(new Set());
    load();
  }

  async function unapprove(taskId: number) {
    if (!await appConfirm('Huỷ nghiệm thu task này?', { danger: true, confirmLabel: 'Huỷ nghiệm thu' })) return;
    const r = await fetch(`/api/tasks/${taskId}/approve`, { method: 'DELETE' });
    if (!r.ok) { appAlert((await r.json().catch(() => null))?.error ?? 'Không huỷ được'); return; }
    load();
  }

  const toggle = (id: number) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSelected = pending.length > 0 && selected.size === pending.length;

  if (loading) return <PageSkeleton />;

  const docsTask = [...pending, ...approved].find(t => t.id === openDocs);

  function row(t: ApprovalTask, isPending: boolean) {
    return (
      <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/50">
        {isPending && canApprove && (
          <td className="p-3">
            <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)}
              className="accent-emerald-500 w-4 h-4" />
          </td>
        )}
        <td className="p-3 font-mono text-xs text-zinc-400">{t.boqCode ?? t.code}</td>
        <td className="p-3 font-medium">{t.name}<p className="text-xs text-zinc-500">{t.wpName}</p></td>
        <td className="p-3 text-zinc-400 text-xs">{t.sheetType}{t.floorLabel ? ` · ${t.floorLabel}` : ''}</td>
        <td className="p-3">
          <button onClick={() => loadDocs(t.id)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition ${t.docCount > 0
              ? 'bg-emerald-950/60 border-emerald-900 text-emerald-300 hover:bg-emerald-900/60'
              : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'}`}>
            <Paperclip className="w-3 h-3" /> {t.docCount} biên bản
          </button>
        </td>
        <td className="p-3">
          <div className="flex gap-1.5">
            <button onClick={() => pickFile(t.id)} disabled={busy} title="Upload biên bản (PDF/ảnh)"
              className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-2 py-1 transition">
              <Upload className="w-3 h-3" /> Biên bản
            </button>
            {!isPending && canApprove && (
              <button onClick={() => unapprove(t.id)}
                className="text-xs bg-red-950/60 hover:bg-red-900/60 border border-red-900 text-red-300 rounded-lg px-2 py-1 transition">
                Huỷ NT
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFileChosen} />
      <AppHeader back title={<><CheckSquare className="w-5 h-5 text-emerald-400" /> Nghiệm thu</>}
        subtitle="Task đạt 100% chờ duyệt · đính kèm biên bản nghiệm thu (PDF/ảnh) · duyệt theo lô">
        {canApprove && selected.size > 0 && (
          <button onClick={approveSelected} disabled={busy}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            <CheckSquare className="w-4 h-4" /> Duyệt {selected.size} task
          </button>
        )}
      </AppHeader>

      <main className="p-6 space-y-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Chờ nghiệm thu ({pending.length})</h2>
            {canApprove && pending.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map(t => t.id)))}
                  className="accent-emerald-500 w-4 h-4" /> Chọn tất cả
              </label>
            )}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  {canApprove && <th className="p-3 w-10"></th>}
                  <th className="text-left p-3">MÃ</th>
                  <th className="text-left p-3">CÔNG VIỆC</th>
                  <th className="text-left p-3">HỆ · TẦNG</th>
                  <th className="text-left p-3">BIÊN BẢN</th>
                  <th className="text-left p-3"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(t => row(t, true))}
                {pending.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Không có task nào đạt 100% chờ nghiệm thu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm text-emerald-400">Đã nghiệm thu ({approved.length})</h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">MÃ</th>
                  <th className="text-left p-3">CÔNG VIỆC</th>
                  <th className="text-left p-3">HỆ · TẦNG</th>
                  <th className="text-left p-3">BIÊN BẢN</th>
                  <th className="text-left p-3"></th>
                </tr>
              </thead>
              <tbody>
                {approved.map(t => row(t, false))}
                {approved.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-zinc-500">Chưa có task nào được nghiệm thu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal danh sách tài liệu */}
      {openDocs !== null && (
        <Modal onClose={() => setOpenDocs(null)} className="max-w-lg max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" /> Biên bản — {docsTask?.name ?? `#${openDocs}`}
              </h3>
              <button onClick={() => setOpenDocs(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              {docs.map(d => (
                <div key={d.id} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-2">
                  <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer"
                    className="text-sm text-emerald-400 hover:underline truncate flex-1">
                    {d.originalName ?? `Tài liệu #${d.id}`}
                  </a>
                  <span className="text-xs text-zinc-500 shrink-0">{fmtSize(d.sizeBytes)} · {d.uploaderName ?? '—'}</span>
                  <button onClick={() => deleteDoc(d.id)} className="text-zinc-500 hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {docs.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">Chưa có biên bản nào.</p>}
              <button onClick={() => pickFile(openDocs)} disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-3 py-2 text-sm transition">
                <Upload className="w-4 h-4" /> Upload biên bản (PDF/ảnh, max 20MB)
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
