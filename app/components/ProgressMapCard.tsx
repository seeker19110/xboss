"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";

type CellData = { progress: number; tasks: number; delayed: number };
type Data = { cells: CellData[] };

// Thẻ tóm tắt trên dashboard — link sang /timeline (trang gộp bản đồ tiến độ + timeline tầng).
export default function ProgressMapCard() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/floors")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);

  if (!data || data.cells.length === 0) return null;

  const totalTasks = data.cells.reduce((s, c) => s + c.tasks, 0);
  const delayedTotal = data.cells.reduce((s, c) => s + c.delayed, 0);
  const overallPct = totalTasks
    ? Math.round((data.cells.reduce((s, c) => s + c.progress * c.tasks, 0) / totalTasks) * 100)
    : 0;

  return (
    <Link
      href="/timeline"
      className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8 hover:border-emerald-700/60 transition group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <h2 className="font-semibold text-sm text-zinc-300 truncate">Tiến độ tháp A</h2>
          <p className="text-xs text-zinc-400 truncate">
            {overallPct}% hoàn thành · bấm để xem timeline theo tầng
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {delayedTotal > 0 && (
          <span className="text-[11px] bg-red-600/80 text-white rounded px-1.5 py-0.5 font-semibold">
            {delayedTotal} trễ
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition" />
      </div>
    </Link>
  );
}
