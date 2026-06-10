'use client';
import { useState } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

type Result = {
  packages?: number; tasks?: number; sheets?: string[];
  errors?: string[]; message?: string; error?: string;
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleUpload() {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import/excel', { method: 'POST', body: fd });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-lg font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> Import Excel</h1>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        <label className="block border-2 border-dashed border-zinc-700 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-600 transition">
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
          {file ? (
            <p className="text-emerald-400 font-medium">{file.name}</p>
          ) : (
            <p className="text-zinc-400">Nhấn để chọn file Excel (.xlsx) tracking ACMV</p>
          )}
        </label>

        <button onClick={handleUpload} disabled={!file || busy}
          className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 py-3 rounded-lg font-medium transition">
          {busy ? 'Đang import...' : 'Bắt đầu import'}
        </button>

        {result && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            {result.error ? (
              <p className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /> {result.error}</p>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
