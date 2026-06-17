'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback } from 'react';
import AppHeader from '@/app/components/AppHeader';
import { Upload, Box, Trash2, ChevronRight, Info } from 'lucide-react';
import { Skeleton } from '@/app/components/Skeleton';

// IFCViewer chỉ chạy client-side (Three.js + WebAssembly không chạy trên server)
const IFCViewer = dynamic(() => import('@/app/components/IFCViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-400">Đang tải viewer...</p>
      </div>
    </div>
  ),
});

interface IFCFile {
  id: number;
  name: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

type Me = { role: string; name: string };

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ViewerPage() {
  const [files, setFiles]           = useState<IFCFile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [me, setMe]                 = useState<Me | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState('');
  const [loadedInfo, setLoadedInfo] = useState<{ total: number; withStatus: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    const r = await fetch('/api/ifc/files');
    if (r.ok) {
      const data: IFCFile[] = await r.json();
      setFiles(data);
      setSelectedId(prev => (prev === null && data.length > 0 ? data[0].id : prev));
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => setMe(j?.user ?? null));
    fetchFiles();
  }, [fetchFiles]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr('');
    setLoadedInfo(null);

    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch('/api/ifc/files', { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) { setUploadErr(d.error ?? 'Lỗi upload'); }
      else {
        await fetchFiles();
        setSelectedId(d.id);
      }
    } catch { setUploadErr('Lỗi kết nối'); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xoá file IFC này sẽ xoá toàn bộ dữ liệu trạng thái lắp đặt. Tiếp tục?')) return;
    await fetch(`/api/ifc/files/${id}`, { method: 'DELETE' });
    await fetchFiles();
    if (selectedId === id) setSelectedId(files.find(f => f.id !== id)?.id ?? null);
  }

  const canUpload = me?.role === 'admin' || me?.role === 'pm';
  const canDelete = me?.role === 'admin';

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        title="Bản vẽ 3D"
        subtitle="Highlight tiến độ lắp đặt theo hiện trường"
        back
        search={false}
      >
        {/* Nút toggle sidebar trên mobile */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition md:hidden"
          aria-label={sidebarOpen ? 'Ẩn danh sách file' : 'Hiện danh sách file'}
        >
          <Box className="w-4 h-4" />
        </button>
      </AppHeader>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar danh sách file IFC */}
        <aside className={`${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'} shrink-0 border-r border-zinc-800 flex flex-col transition-all duration-200 md:w-60`}>
          <div className="p-3 border-b border-zinc-800 shrink-0">
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide mb-2">File IFC</p>

            {canUpload && (
              <label className={`flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-dashed text-xs transition cursor-pointer ${
                uploading
                  ? 'border-zinc-700 text-zinc-600 cursor-not-allowed'
                  : 'border-zinc-700 text-zinc-400 hover:border-emerald-600 hover:text-emerald-400'
              }`}>
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Đang upload...' : 'Upload file .ifc'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ifc"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            )}
            {uploadErr && (
              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" />
                {uploadErr}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="p-6 text-center">
                <Box className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500 font-medium">Chưa có file IFC</p>
                {canUpload && (
                  <p className="text-xs text-zinc-600 mt-1">Upload file bản vẽ để bắt đầu</p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-900/80">
                {files.map(f => (
                  <li key={f.id} className="group relative">
                    <button
                      className={`w-full text-left p-3 transition ${selectedId === f.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
                      onClick={() => { setSelectedId(f.id); setLoadedInfo(null); setSidebarOpen(false); }}
                    >
                      <div className="flex items-start gap-2.5">
                        <Box className={`w-4 h-4 mt-0.5 shrink-0 ${selectedId === f.id ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-zinc-200 truncate leading-snug">{f.name}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {fmtSize(f.file_size)} · {fmtDate(f.uploaded_at)}
                          </p>
                          {f.uploaded_by_name && (
                            <p className="text-[10px] text-zinc-600 truncate">{f.uploaded_by_name}</p>
                          )}
                        </div>
                        {selectedId === f.id && (
                          <ChevronRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                      </div>
                    </button>

                    {canDelete && (
                      <button
                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                        onClick={e => { e.stopPropagation(); handleDelete(f.id); }}
                        title="Xoá file IFC"
                        aria-label="Xoá file IFC"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Chú thích màu */}
          <div className="p-3 border-t border-zinc-800 shrink-0">
            <p className="text-[10px] text-zinc-500 font-semibold mb-2 uppercase tracking-wide">Chú giải màu</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-zinc-500 shrink-0" />
                <span className="text-zinc-400">Chưa lắp đặt</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-amber-400 shrink-0" />
                <span className="text-zinc-400">Đang lắp đặt</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0" />
                <span className="text-zinc-400">Hoàn thành</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Vùng 3D viewer */}
        <main className="flex-1 relative overflow-hidden bg-zinc-950">
          {selectedId ? (
            <>
              <IFCViewer
                key={selectedId}
                fileId={selectedId}
                onLoaded={(total, withStatus) => setLoadedInfo({ total, withStatus })}
              />
              {/* Badge thông tin sau khi load xong */}
              {loadedInfo && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
                  <div className="bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-full px-3 py-1 text-[10px] text-zinc-400">
                    {loadedInfo.total} cấu kiện · {loadedInfo.withStatus} đã có trạng thái
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-5 text-center px-6">
              <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Box className="w-10 h-10 text-zinc-600" />
              </div>
              <div>
                <p className="text-zinc-300 font-semibold text-lg">Chưa chọn bản vẽ</p>
                <p className="text-sm text-zinc-500 mt-1 max-w-xs">
                  {canUpload
                    ? 'Upload file IFC từ Revit hoặc chọn từ danh sách bên trái để xem mô hình 3D'
                    : 'Chọn file IFC từ danh sách bên trái để xem mô hình 3D'}
                </p>
              </div>
              {files.length === 0 && !canUpload && (
                <p className="text-xs text-zinc-600">Admin/PM cần upload file IFC trước</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
