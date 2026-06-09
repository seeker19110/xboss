'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';

export default function XBossDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Vui lòng chọn file Excel');
      return;
    }

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import/excel', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import thất bại');
      }

      setResult(data);
      console.log('Import result:', data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">🚀 XBoss - Quản lý Thi công MEP</h1>
        <p className="text-zinc-400 mb-8">Hệ thống theo dõi tiến độ Ống gió & MEP</p>

        {/* Upload Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
            <h2 className="text-2xl font-semibold">Import File Excel AVIO</h2>
          </div>

          <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="excel-upload"
            />
            <label
              htmlFor="excel-upload"
              className="cursor-pointer flex flex-col items-center justify-center"
            >
              <Upload className="w-12 h-12 text-zinc-500 mb-4" />
              <p className="text-lg font-medium">
                {file ? file.name : 'Click để chọn file Excel'}
              </p>
              <p className="text-sm text-zinc-500 mt-1">Hỗ trợ file GIA THÀNH - TT AVIO</p>
            </label>
          </div>

          <button
            onClick={handleImport}
            disabled={!file || uploading}
            className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 py-4 rounded-xl font-semibold text-lg transition"
          >
            {uploading ? 'Đang Import...' : '🚀 Bắt đầu Import vào Database'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="bg-zinc-900 border border-emerald-900 rounded-2xl p-6">
            <h3 className="text-xl font-semibold mb-4 text-emerald-400">✅ Import Hoàn tất</h3>
            <pre className="bg-black p-4 rounded-lg text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 p-4 rounded-xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}