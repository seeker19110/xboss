'use client';
import { useEffect, useState } from 'react';
import { ClipboardList, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';

type MyTask = {
  id: number; code: string; name: string; status: string;
  endDate: string | null; progressPercent: number;
  sheetType: string; sheetSlug?: string | null;
};
type Data = { tasks: MyTask[]; summary: { total: number; delayed: number; done: number } };

export default function MyTasksPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my-tasks').then(async r => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      setData(await r.json());
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

  const s = data?.summary;
  const tasks = data?.tasks ?? [];

  // Nhóm theo sheet
  const bySheet = new Map<string, { slug: string | null; total: number; delayed: number; done: number; avgProgress: number }>();
  for (const t of tasks) {
    const key = t.sheetType;
    if (!bySheet.has(key)) bySheet.set(key, { slug: t.sheetSlug ?? slugFromCode(t.sheetType), total: 0, delayed: 0, done: 0, avgProgress: 0 });
    const g = bySheet.get(key)!;
    g.total++;
    if (t.status === 'tre') g.delayed++;
    if (t.progressPercent >= 1) g.done++;
    g.avgProgress += t.progressPercent;
  }
  for (const g of bySheet.values()) g.avgProgress = g.total ? g.avgProgress / g.total : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back title={<><ClipboardList className="w-5 h-5 text-emerald-400" /> Việc của tôi</>}
        subtitle="Tổng hợp task được giao theo từng hệ" />

      <main className="p-6 max-w-4xl mx-auto">
        {/* Thống kê tổng */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase mb-1">Đang làm</p>
            <p className="text-2xl font-bold text-blue-300">{(s?.total ?? 0) - (s?.done ?? 0)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400" /> Đang trễ</p>
            <p className="text-2xl font-bold text-red-300">{s?.delayed ?? 0}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Xong</p>
            <p className="text-2xl font-bold text-emerald-300">{s?.done ?? 0}</p>
          </div>
        </div>

        {/* Card theo sheet */}
        {bySheet.size === 0 ? (
          <div className="p-10 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            Bạn chưa được giao task nào. Liên hệ PM để được phân công.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...bySheet.entries()].map(([sheetType, g]) => {
              const pct = Math.round(g.avgProgress * 100);
              return (
                <a key={sheetType} href={g.slug ? `/tracking/${g.slug}` : '#'}
                  className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 flex items-center gap-4 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-400 uppercase mb-1 truncate">{sheetType}</p>
                    <p className="text-2xl font-bold">{pct}%</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {g.delayed > 0
                        ? <span className="text-red-400">{g.delayed} trễ</span>
                        : <span className="text-zinc-500">0 trễ</span>}
                      {' · '}{g.done}/{g.total} xong
                    </p>
                    <div className="mt-2 bg-zinc-800 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600 shrink-0" />
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
