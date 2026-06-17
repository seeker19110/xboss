'use client';
import { useEffect, useState } from 'react';
import { Ban, ArrowRight } from 'lucide-react';

type Bar = { id: number; code: string; name: string; sheetType: string; sheetSlug: string | null; floorLabel: string | null };
type Blocked = { id: number; preds: string[] };

// Panel "Việc bị chặn": nhóm đã tới ngày bắt đầu nhưng việc trước (phụ thuộc) chưa xong.
// Dữ liệu lấy từ /api/gantt (đã tính sẵn `blocked`).
export default function BlockedPanel() {
  const [bars, setBars] = useState<Bar[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);

  useEffect(() => {
    fetch('/api/gantt').then(r => r.ok ? r.json() : null).then(j => {
      if (!j) return;
      setBars(j.bars ?? []); setBlocked(j.blocked ?? []);
    });
  }, []);

  if (blocked.length === 0) return null;
  const byId = new Map(bars.map(b => [b.id, b]));

  return (
    <div className="bg-zinc-900 border border-rose-500/30 rounded-xl p-4 mb-8">
      <h2 className="font-semibold mb-1 text-sm text-zinc-300 flex items-center gap-2">
        <Ban className="w-4 h-4 text-rose-400" /> Việc bị chặn ({blocked.length})
      </h2>
      <p className="text-xs text-zinc-600 mb-3">Nhóm đã tới ngày bắt đầu nhưng việc trước (phụ thuộc) chưa hoàn thành — cần xử lý việc trước để khơi thông.</p>
      <ul className="space-y-1.5">
        {blocked.map(b => {
          const pkg = byId.get(b.id);
          if (!pkg) return null;
          const href = (pkg.sheetSlug ?? '') ? `/tracking/${pkg.sheetSlug}${pkg.floorLabel ? `?floor=${encodeURIComponent(pkg.floorLabel)}` : ''}` : null;
          const row = (
            <div className="flex items-center gap-2 text-sm bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700">
              <span className="text-[10px] text-zinc-500 uppercase shrink-0">{pkg.sheetType}</span>
              <span className="font-mono text-xs text-zinc-300 shrink-0">{pkg.code}</span>
              <span className="text-xs text-zinc-500 truncate flex-1">{pkg.name}</span>
              <span className="text-xs text-rose-400 flex items-center gap-1 shrink-0">
                <ArrowRight className="w-3 h-3" /> chờ {b.preds.join(', ')}
              </span>
            </div>
          );
          return <li key={b.id}>{href ? <a href={href}>{row}</a> : row}</li>;
        })}
      </ul>
    </div>
  );
}
