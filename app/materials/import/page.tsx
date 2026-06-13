'use client';
import { useRef, useState } from 'react';
import { Package, Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';

type RowResult = { row: number; name: string; status: 'ok' | 'skip' | 'error'; message?: string };
type ImportResult = { inserted: number; skipped: number; errors: number; results: RowResult[] };

export default function ImportMaterialsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  function pickFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setError('Chỉ nhận file Excel (.xlsx / .xls)'); return; }
    setFile(f); setError(''); setResult(null);
  }

  async function doImport() {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    const res = await fetch('/api/materials/import', { method: 'POST', body: form });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Lỗi không xác định'); setBusy(false); return; }
    setResult(j);
    setBusy(false);
  }

  function reset() { setFile(null); setResult(null); setError(''); if (fileRef.current) fileRef.current.value = ''; }

  const okRows    = result?.results.filter(r => r.status === 'ok') ?? [];
  const errRows   = result?.results.filter(r => r.status === 'error') ?? [];
  const skipRows  = result?.results.filter(r => r.status === 'skip') ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back title={<><Package className="w-5 h-5 text-emerald-400" /> Import vật tư</>}>
        <a href="/api/materials/template" download
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition">
          <Download className="w-3.5 h-3.5" /> Tải mẫu (.xlsx)
        </a>
      </AppHeader>

      <main className="p-6 max-w-3xl mx-auto space-y-5">

        {/* Chọn file */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <p className="font-semibold text-sm">Chọn file Excel đã điền theo mẫu</p>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
              ${dragOver ? 'border-emerald-500 bg-emerald-950/20' : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/40'}
              ${file ? 'border-emerald-700 bg-emerald-950/10' : ''}`}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && pickFile(e.target.files[0])} />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
                <p className="font-medium text-emerald-300">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB — bấm để chọn file khác</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-400">
                <Upload className="w-10 h-10" />
                <p className="text-sm">Kéo thả file vào đây hoặc <span className="text-emerald-400 underline">chọn file</span></p>
                <p className="text-xs text-zinc-600">Chấp nhận .xlsx, .xls</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/40 text-red-300 px-4 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {/* Chế độ import */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 font-medium">Chế độ import</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'append',  label: 'Thêm vào',   desc: 'Giữ nguyên vật tư cũ, thêm các hàng mới từ file.' },
                { value: 'replace', label: 'Thay thế',   desc: 'Xoá toàn bộ vật tư của các hệ có trong file, rồi nhập lại từ đầu.' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setMode(opt.value)}
                  className={`text-left rounded-lg border px-4 py-3 transition
                    ${mode === opt.value
                      ? opt.value === 'replace'
                        ? 'border-red-700 bg-red-950/30 text-red-300'
                        : 'border-emerald-700 bg-emerald-950/20 text-emerald-300'
                      : 'border-zinc-700 hover:border-zinc-600 text-zinc-400'}`}>
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">{opt.desc}</p>
                </button>
              ))}
            </div>
            {mode === 'replace' && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Chế độ Thay thế sẽ xoá vĩnh viễn vật tư cũ của các hệ có trong file.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={doImport} disabled={!file || busy}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg px-5 py-2.5 text-sm font-medium transition">
              <Upload className="w-4 h-4" />
              {busy ? 'Đang import...' : 'Bắt đầu import'}
            </button>
            {(file || result) && (
              <button onClick={reset}
                className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition">
                <RotateCcw className="w-4 h-4" /> Làm lại
              </button>
            )}
          </div>
        </div>

        {/* Kết quả */}
        {result && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <p className="font-semibold text-sm">Kết quả import</p>

            {/* Tóm tắt */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{result.inserted}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Thêm thành công</p>
              </div>
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-zinc-400">{result.skipped}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Bỏ qua (trống)</p>
              </div>
              <div className={`border rounded-lg p-3 text-center ${result.errors > 0 ? 'bg-red-950/30 border-red-800/50' : 'bg-zinc-800/50 border-zinc-700'}`}>
                <p className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-400' : 'text-zinc-400'}`}>{result.errors}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Lỗi</p>
              </div>
            </div>

            {result.inserted > 0 && (
              <a href="/materials"
                className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 underline">
                <ArrowLeft className="w-3.5 h-3.5" /> Xem danh sách vật tư
              </a>
            )}

            {/* Chi tiết theo từng hàng */}
            {result.results.length > 0 && (
              <div className="overflow-auto max-h-80 rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="text-center px-3 py-2 w-12">Hàng</th>
                      <th className="text-left px-3 py-2">Tên vật tư</th>
                      <th className="text-center px-3 py-2 w-24">Kết quả</th>
                      <th className="text-left px-3 py-2">Ghi chú lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map(r => (
                      <tr key={r.row} className="border-b border-zinc-800/50">
                        <td className="text-center px-3 py-1.5 text-zinc-500">{r.row}</td>
                        <td className="px-3 py-1.5 text-zinc-300">{r.name}</td>
                        <td className="px-3 py-1.5 text-center">
                          {r.status === 'ok'    && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle className="w-3.5 h-3.5" /> OK</span>}
                          {r.status === 'skip'  && <span className="inline-flex items-center gap-1 text-zinc-500">Bỏ qua</span>}
                          {r.status === 'error' && <span className="inline-flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" /> Lỗi</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{r.message ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Lọc nhanh lỗi */}
            {errRows.length > 0 && (
              <div className="rounded-lg border border-red-900 bg-red-950/20 p-3 space-y-1">
                <p className="text-xs font-medium text-red-400 mb-2">{errRows.length} hàng bị lỗi — sửa trong file rồi import lại:</p>
                {errRows.map(r => (
                  <p key={r.row} className="text-xs text-red-300">Hàng {r.row}: <span className="font-medium">{r.name}</span> — {r.message}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
