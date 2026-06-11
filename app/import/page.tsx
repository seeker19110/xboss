'use client';
import { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, XCircle, Eye, AlertTriangle } from 'lucide-react';

type SheetPreview = {
  sheetName: string; code: string; label: string;
  packages: number; tasks: number; dimColumns: number; warnings: string[];
};
type Preview = {
  sheets: SheetPreview[]; unknownSheets: string[];
  totalPackages: number; totalTasks: number; totalWarnings: number;
};
type Result = {
  packages?: number; tasks?: number; sheets?: string[];
  errors?: string[]; message?: string; error?: string;
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setAllowed(j.user?.role === 'admin' || j.user?.role === 'pm');
    });
  }, []);

  function pickFile(f: File | null) {
    setFile(f); setPreview(null); setResult(null); setError('');
  }

  async function post(mode?: string): Promise<Response> {
    const fd = new FormData();
    fd.append('file', file!);
    if (mode) fd.append('mode', mode);
    return fetch('/api/import/excel', { method: 'POST', body: fd });
  }

  async function handlePreview() {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await post('preview');
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? 'Lỗi không xác định'); setPreview(null); }
      else setPreview(j.preview);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const res = await post();
      const j = await res.json();
      if (!res.ok) setError(j.error ?? 'Lỗi không xác định');
      else { setResult(j); setPreview(null); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-lg font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> Import Excel</h1>
        <span className="text-xs text-zinc-500 ml-auto">Bước 1: chọn file → Bước 2: xem trước → Bước 3: xác nhận</span>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        {allowed === false && (
          <div className="rounded-xl border border-amber-800 bg-amber-950/40 text-amber-300 p-4 mb-4 text-sm">
            Bạn không có quyền import (chỉ Admin/PM). Đăng nhập bằng tài khoản Admin hoặc PM để dùng chức năng này.
          </div>
        )}

        <label className="block border-2 border-dashed border-zinc-700 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-600 transition">
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
          {file ? (
            <p className="text-emerald-400 font-medium">{file.name}</p>
          ) : (
            <p className="text-zinc-400">Nhấn để chọn file Excel (.xlsx) tracking ACMV</p>
          )}
        </label>

        {!preview && !result && (
          <button onClick={handlePreview} disabled={!file || busy}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-500 py-3 rounded-lg font-medium transition">
            <Eye className="w-4 h-4" /> {busy ? 'Đang phân tích...' : 'Xem trước (chưa ghi dữ liệu)'}
          </button>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-800 bg-red-950/40 p-4">
            <p className="flex items-center gap-2 text-red-400 text-sm"><XCircle className="w-5 h-5" /> {error}</p>
          </div>
        )}

        {/* ===== Bước 2: Preview ===== */}
        {preview && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-sm">Kết quả phân tích</h2>
              <span className="text-xs text-zinc-400">{preview.sheets.length} sheet · {preview.totalPackages} nhóm · {preview.totalTasks} task</span>
              {preview.totalWarnings > 0 && (
                <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {preview.totalWarnings} cảnh báo</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">Sheet</th>
                  <th className="text-right p-3">Nhóm</th>
                  <th className="text-right p-3">Task</th>
                  <th className="text-right p-3">Cột lưới</th>
                  <th className="text-right p-3">Cảnh báo</th>
                </tr>
              </thead>
              <tbody>
                {preview.sheets.map(s => (
                  <tr key={s.sheetName} className="border-b border-zinc-800/50">
                    <td className="p-3"><span className="font-medium">{s.code}</span> <span className="text-zinc-500 text-xs">{s.label}</span></td>
                    <td className="p-3 text-right">{s.packages}</td>
                    <td className="p-3 text-right">{s.tasks}</td>
                    <td className="p-3 text-right">{s.dimColumns}</td>
                    <td className={`p-3 text-right ${s.warnings.length ? 'text-amber-400' : 'text-zinc-600'}`}>{s.warnings.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {preview.unknownSheets.length > 0 && (
              <p className="px-4 py-2 text-xs text-zinc-500 border-t border-zinc-800">
                Sheet bị bỏ qua (không nhận diện): {preview.unknownSheets.join(', ')}
              </p>
            )}

            {preview.totalWarnings > 0 && (
              <details className="px-4 py-2 border-t border-zinc-800 text-xs text-amber-400">
                <summary className="cursor-pointer">Chi tiết {preview.totalWarnings} cảnh báo</summary>
                <ul className="mt-2 space-y-0.5 max-h-48 overflow-auto">
                  {preview.sheets.flatMap(s => s.warnings.map((w, i) => <li key={s.sheetName + i}>[{s.code}] {w}</li>))}
                </ul>
              </details>
            )}

            <div className="p-4 border-t border-zinc-800 bg-amber-950/20 text-xs text-amber-300">
              ⚠️ Import sẽ <b>cập nhật đè</b> trạng thái/% các task trùng mã đang có trong hệ thống theo nội dung file này.
            </div>

            <div className="p-4 flex gap-3">
              <button onClick={handleImport} disabled={busy}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 py-3 rounded-lg font-medium transition">
                {busy ? 'Đang import...' : `✓ Xác nhận import ${preview.totalTasks} task`}
              </button>
              <button onClick={() => setPreview(null)} disabled={busy}
                className="px-5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition">Huỷ</button>
            </div>
          </div>
        )}

        {/* ===== Bước 3: Kết quả ===== */}
        {result && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="flex items-center gap-2 text-emerald-400 mb-2"><CheckCircle2 className="w-5 h-5" /> {result.message}</p>
            <p className="text-sm text-zinc-400">Sheets: {result.sheets?.join(', ')}</p>
            <p className="text-sm text-zinc-400">{result.packages} nhóm · {result.tasks} tasks</p>
            {!!result.errors?.length && (
              <details className="mt-2 text-xs text-amber-400">
                <summary>{result.errors.length} cảnh báo</summary>
                <ul className="mt-1 space-y-0.5">{result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
            <a href="/" className="inline-block mt-3 text-emerald-400 hover:underline text-sm">→ Xem Dashboard</a>
          </div>
        )}
      </main>
    </div>
  );
}
