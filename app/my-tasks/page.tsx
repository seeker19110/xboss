'use client';
import { useEffect, useState } from 'react';
import { ClipboardList, AlertTriangle, CheckCircle2, Camera, ChevronRight } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};
const STATUS_CLS: Record<string, string> = {
  chuan_bi: 'bg-zinc-800 text-zinc-300', dang_thi_cong: 'bg-blue-950 text-blue-300',
  hoan_thanh: 'bg-emerald-950 text-emerald-300', nghiem_thu: 'bg-teal-950 text-teal-300',
  tre: 'bg-red-950 text-red-300',
};

type MyTask = {
  id: number; code: string; name: string; status: string;
  startDate: string | null; endDate: string | null; progressPercent: number;
  photoCount: number; packageCode: string; packageName: string;
  floorLabel: string | null; sheetType: string; sheetSlug?: string | null;
};
type Data = { tasks: MyTask[]; summary: { total: number; delayed: number; done: number } };

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('vi-VN');
};

// Số ngày còn lại tới deadline (so sánh chuỗi ISO — múi giờ không quan trọng ở độ phân giải ngày).
function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate + 'T00:00:00');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  return Math.round((end.getTime() - today.getTime()) / 86400_000);
}

export default function MyTasksPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'delayed' | 'doing' | 'done'>('all');

  useEffect(() => {
    fetch('/api/my-tasks').then(async r => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      setData(await r.json());
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

  const tasks = (data?.tasks ?? []).filter(t => {
    if (filter === 'delayed') return t.status === 'tre';
    if (filter === 'done') return t.progressPercent >= 1;
    if (filter === 'doing') return t.progressPercent < 1 && t.status !== 'tre';
    return true;
  });
  const s = data?.summary;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back title={<><ClipboardList className="w-5 h-5 text-emerald-400" /> Việc của tôi</>}
        subtitle="Các task được giao cho bạn · sắp theo deadline" />

      <main className="p-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button onClick={() => setFilter(filter === 'doing' ? 'all' : 'doing')}
            className={`bg-zinc-900 border rounded-xl p-4 text-left transition ${filter === 'doing' ? 'border-blue-600' : 'border-zinc-800 hover:border-zinc-700'}`}>
            <p className="text-xs text-zinc-400 uppercase mb-1">Đang làm</p>
            <p className="text-2xl font-bold text-blue-300">{(s?.total ?? 0) - (s?.done ?? 0)}</p>
          </button>
          <button onClick={() => setFilter(filter === 'delayed' ? 'all' : 'delayed')}
            className={`bg-zinc-900 border rounded-xl p-4 text-left transition ${filter === 'delayed' ? 'border-red-600' : 'border-zinc-800 hover:border-zinc-700'}`}>
            <p className="text-xs text-zinc-400 uppercase mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400" /> Đang trễ</p>
            <p className="text-2xl font-bold text-red-300">{s?.delayed ?? 0}</p>
          </button>
          <button onClick={() => setFilter(filter === 'done' ? 'all' : 'done')}
            className={`bg-zinc-900 border rounded-xl p-4 text-left transition ${filter === 'done' ? 'border-emerald-600' : 'border-zinc-800 hover:border-zinc-700'}`}>
            <p className="text-xs text-zinc-400 uppercase mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Xong</p>
            <p className="text-2xl font-bold text-emerald-300">{s?.done ?? 0}</p>
          </button>
        </div>

        {tasks.length === 0 && (
          <div className="p-10 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            {data?.summary.total === 0
              ? 'Bạn chưa được giao task nào. Liên hệ PM để được phân công.'
              : 'Không có task nào khớp bộ lọc.'}
          </div>
        )}

        <div className="space-y-2">
          {tasks.map(t => {
            const slug = t.sheetSlug ?? slugFromCode(t.sheetType);
            const left = daysLeft(t.endDate);
            const urgent = left !== null && left <= 3 && t.progressPercent < 1 && t.status !== 'nghiem_thu';
            const href = slug ? `/tracking/${slug}${t.floorLabel ? `?floor=${encodeURIComponent(t.floorLabel)}` : ''}` : '#';
            return (
              <a key={t.id} href={href}
                className={`block bg-zinc-900 border rounded-xl px-4 py-3 transition hover:border-emerald-700 ${t.status === 'tre' ? 'border-red-900' : 'border-zinc-800'}`}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-emerald-400 text-sm shrink-0">{t.code}</span>
                  <span className="font-medium text-sm flex-1 truncate" title={t.name}>{t.name}</span>
                  {t.photoCount > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-sky-400 shrink-0"><Camera className="w-3 h-3" />{t.photoCount}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs shrink-0 ${STATUS_CLS[t.status] ?? STATUS_CLS.chuan_bi}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                  <span>{t.sheetType}{t.floorLabel ? ` · ${t.floorLabel}` : ''} · {t.packageCode}</span>
                  <span className={t.status === 'tre' ? 'text-red-400' : urgent ? 'text-amber-400' : ''}>
                    Hạn: {fmtDate(t.endDate)}
                    {left !== null && t.progressPercent < 1 && (left < 0 ? ` (quá ${-left} ngày)` : ` (còn ${left} ngày)`)}
                  </span>
                  <span className="ml-auto flex items-center gap-2 w-36">
                    <span className="bg-zinc-800 rounded-full h-1.5 flex-1">
                      <span className="bg-emerald-500 h-1.5 rounded-full block" style={{ width: `${(t.progressPercent ?? 0) * 100}%` }} />
                    </span>
                    <span className="text-zinc-400 w-9 text-right">{Math.round((t.progressPercent ?? 0) * 100)}%</span>
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
