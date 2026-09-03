"use client";
// Tách nguyên văn khỏi TrackingGrid.tsx (M121 PR1) — không đổi hành vi.
import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { formatDateTimeVN } from "@/lib/nen/date";
import { STATUS_LABEL, type StatusSlug } from "@/lib/tien-do/status";
import type { GridTask } from "../types";

type HistoryItem = {
  id: number;
  oldProgress: number | null;
  newProgress: number | null;
  status: string | null;
  note: string | null;
  changedBy: string | null;
  changedAt: string;
};

export function HistoryModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/history`)
      .then((r) => r.json())
      .then((j) => setItems(j.history ?? []));
  }, [task.id]);

  const pct = (v: number | null) => `${Math.round((v ?? 0) * 100)}%`;

  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[80vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <History className="w-4 h-4 text-emerald-400" />
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{task.name}</h3>
          <p className="text-xs text-zinc-500 font-mono">
            {task.code} · hiện tại {pct(task.progressPercent)}
          </p>
        </div>
        <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-auto p-4">
        {items === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
        {items?.length === 0 && (
          <p className="text-sm text-zinc-500">Chưa có thay đổi nào được ghi nhận.</p>
        )}
        {!!items?.length && (
          <ol className="relative border-l border-zinc-800 ml-1.5 space-y-4">
            {items.map((h) => {
              const up = (h.newProgress ?? 0) >= (h.oldProgress ?? 0);
              return (
                <li key={h.id} className="ml-4">
                  <span
                    className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${up ? "bg-emerald-500" : "bg-amber-500"}`}
                  />
                  <p className="text-sm">
                    <span className="text-zinc-400">{pct(h.oldProgress)}</span>
                    <span className="text-zinc-600"> → </span>
                    <span
                      className={up ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}
                    >
                      {pct(h.newProgress)}
                    </span>
                    {h.status && (
                      <span className="ml-2 px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400">
                        {STATUS_LABEL[h.status as StatusSlug] ?? h.status}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {h.changedBy ?? "—"} · {formatDateTimeVN(h.changedAt)}
                    {h.note && <span className="text-zinc-600"> · {h.note}</span>}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Modal>
  );
}
