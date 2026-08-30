"use client";
import { useEffect, useState } from "react";
import { Ban, ArrowRight } from "lucide-react";

type Bar = {
  id: number;
  code: string;
  name: string;
  sheetType: string;
  sheetSlug: string | null;
  floorLabel: string | null;
};
type Blocked = { id: number; preds: string[] };

// Panel "Việc bị chặn": nhóm đã tới ngày bắt đầu nhưng việc trước (phụ thuộc) chưa xong.
// Dữ liệu lấy từ /api/gantt (đã tính sẵn `blocked`).
export default function BlockedPanel() {
  const [bars, setBars] = useState<Bar[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);

  useEffect(() => {
    fetch("/api/gantt")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setBars(j.bars ?? []);
        setBlocked(j.blocked ?? []);
      });
  }, []);

  if (blocked.length === 0) return null;
  const byId = new Map(bars.map((b) => [b.id, b]));

  return (
    <div className="bento-card border-rose-900/60 bg-rose-950/20 p-4 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <Ban className="w-4 h-4 text-rose-400" /> Hạng mục bị chặn ({blocked.length})
        </h2>
        <span className="w-2 h-2 rounded-full bg-rose-500 live-pulse" />
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Đã tới ngày bắt đầu theo kế hoạch nhưng công việc tiên quyết chưa hoàn thành.
      </p>
      <ul className="space-y-2">
        {blocked.map((b) => {
          const pkg = byId.get(b.id);
          if (!pkg) return null;
          const href =
            (pkg.sheetSlug ?? "")
              ? `/tracking/${pkg.sheetSlug}${pkg.floorLabel ? `?floor=${encodeURIComponent(pkg.floorLabel)}` : ""}`
              : null;
          const row = (
            <div className="flex items-center gap-2 text-sm bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 hover:border-zinc-700 transition">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                {pkg.sheetType}
              </span>
              <span className="font-mono text-xs font-semibold text-zinc-200 shrink-0">
                {pkg.code}
              </span>
              <span className="text-xs text-zinc-300 truncate flex-1">{pkg.name}</span>
              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1 shrink-0">
                <ArrowRight className="w-3 h-3" /> chờ {b.preds.join(", ")}
              </span>
            </div>
          );
          return <li key={b.id}>{href ? <a href={href}>{row}</a> : row}</li>;
        })}
      </ul>
    </div>
  );
}
