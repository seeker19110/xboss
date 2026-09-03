"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

// Khối "Độ phủ ánh xạ BOQ" (M122 PR1) — cho người dùng thấy bao nhiêu task đã gắn được
// giá trị hợp đồng qua boq_task_map, TRƯỚC khi bật trọng số theo giá trị ở PR3. Độ phủ
// thấp thì công thức trọng số thoái hoá về bình quân số task, nên con số này là căn cứ
// quyết định ngưỡng bật (M122 §17.2).

type DoPhuTheoHe = {
  he: string | null;
  tenHe: string | null;
  tong: number;
  daMap: number;
  tyLe: number;
};
type DongWeightLech = {
  boqItemId: number;
  code: string;
  name: string;
  tongWeight: number;
  soTask: number;
};
type DoPhu = {
  tong: number;
  daMap: number;
  tyLe: number;
  theoHe: DoPhuTheoHe[];
  weightLech: DongWeightLech[];
};

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

// Ngưỡng chỉ để tô màu cho dễ đọc, không phải luật nghiệp vụ.
function mauTyLe(tyLe: number) {
  if (tyLe >= 0.8) return "text-emerald-400";
  if (tyLe >= 0.5) return "text-amber-400";
  return "text-rose-400";
}

export default function DoPhuBoqCard() {
  const [duLieu, setDuLieu] = useState<DoPhu | null>(null);

  useEffect(() => {
    fetch("/api/boq/coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDuLieu)
      .catch(() => setDuLieu(null));
  }, []);

  if (!duLieu || duLieu.tong === 0) return null;

  return (
    <section className="bento-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Độ phủ ánh xạ BOQ
        </h2>
        <span className={`text-lg font-bold font-mono tabular-nums ${mauTyLe(duLieu.tyLe)}`}>
          {pct(duLieu.tyLe)}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500">
        {duLieu.daMap}/{duLieu.tong} công việc đã gắn dòng BOQ. Chỉ những công việc đã gắn mới có
        giá trị hợp đồng để tính trọng số kế hoạch; phần còn lại được quy về trọng số bình quân.
      </p>

      {duLieu.theoHe.length > 1 && (
        <ul className="space-y-1.5">
          {duLieu.theoHe.map((h) => (
            <li key={h.he ?? "__none"} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate text-zinc-300">
                {h.tenHe ?? "Chưa gán hệ"}
              </span>
              <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.round(h.tyLe * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-mono tabular-nums text-zinc-400">
                {h.daMap}/{h.tong} · {pct(h.tyLe)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {duLieu.weightLech.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-400 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {duLieu.weightLech.length} dòng BOQ có tổng tỷ trọng khác 1
          </summary>
          <ul className="mt-2 space-y-1 text-zinc-400 max-h-48 overflow-auto">
            {duLieu.weightLech.map((d) => (
              <li key={d.boqItemId} className="flex gap-2">
                <span className="font-mono text-zinc-300 shrink-0">{d.code}</span>
                <span className="truncate flex-1">{d.name}</span>
                <span className="font-mono tabular-nums shrink-0">
                  Σ {d.tongWeight.toFixed(2)} · {d.soTask} CV
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
