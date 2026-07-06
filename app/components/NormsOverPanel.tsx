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
    <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 mb-8">
      <h2 className="font-semibold mb-1 text-sm text-zinc-300 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-amber-400" /> Vật tư vượt định mức theo hạng mục (
        {items.length})
      </h2>
      <p className="text-xs text-zinc-600 mb-3">
        Tiêu hao thực tế vượt quá 20% so định mức × khối lượng thực hiện — bấm để xem chi tiết BOQ.
      </p>
      <ul className="space-y-1.5">
        {items.map((n) => (
          <li key={n.normId}>
            <a
              href="/boq"
              className="flex items-center gap-2 text-sm bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700"
            >
              <span className="font-mono text-xs text-zinc-300 shrink-0">{n.boqCode}</span>
              <span className="text-xs text-zinc-500 truncate flex-1">{n.resourceLabel}</span>
              <span className="text-xs text-amber-400 shrink-0">
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
