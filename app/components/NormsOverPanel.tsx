"use client";
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

type OverNormItem = {
  normId: number;
  boqItemId: number;
  boqCode: string;
  resourceLabel: string;
  unitLabel: string;
  expected: number;
  actual: number;
  variancePct: number;
};

// Panel "Vật tư vượt định mức theo hạng mục" (M18) — bấm vào mở /boq (lọc đúng dòng qua
// query ?highlight=). Dữ liệu từ /api/norms/over (cảnh báo tin cậy: chỉ vật tư).
export default function NormsOverPanel() {
  const [items, setItems] = useState<OverNormItem[]>([]);

  useEffect(() => {
    fetch("/api/norms/over")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setItems(j?.items ?? []))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="bento-card border-amber-900/60 bg-amber-950/20 p-4 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-amber-400" /> Vật tư vượt định mức theo hạng mục (
          {items.length})
        </h2>
        <span className="w-2 h-2 rounded-full bg-amber-500 live-pulse" />
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Tiêu hao thực tế vượt quá 20% so định mức × khối lượng thực hiện — bấm để xem chi tiết BOQ.
      </p>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.normId}>
            <a
              href="/boq"
              className="flex items-center gap-2 text-sm bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 hover:border-zinc-700 transition"
            >
              <span className="font-mono text-xs font-semibold text-zinc-200 shrink-0 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                {n.boqCode}
              </span>
              <span className="text-xs text-zinc-300 truncate flex-1">{n.resourceLabel}</span>
              <span className="text-xs font-semibold text-amber-400 shrink-0">
                +{Math.round(n.variancePct)}% ({n.actual.toFixed(1)}/{n.expected.toFixed(1)}{" "}
                {n.unitLabel})
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
