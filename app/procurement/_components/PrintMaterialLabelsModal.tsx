"use client";
// Chọn vật tư để in tem QR (M58 PR1) — mở trang in `/api/qr/labels?kind=mt&ids=…` ở tab mới.
// Khôi phục modal của trang /materials cũ, bị rơi mất khi gộp vào tab "Kho & Định Mức" của
// /procurement (commit 3044a12a). Route in tem chỉ cho Admin/PM (CAN.export) — tab chỉ hiện
// nút mở modal cho đúng nhóm này, API vẫn là ranh giới thật.
import { useMemo, useState } from "react";
import { QrCode, Search, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import type { Material } from "./InventoryTab";

export default function PrintMaterialLabelsModal({
  materials,
  onClose,
}: {
  materials: Material[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return materials;
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) || (m.boqCode ?? "").toLowerCase().includes(needle),
    );
  }, [materials, q]);

  const allFilteredChecked = filtered.length > 0 && filtered.every((m) => checked.has(m.id));

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Chọn/bỏ chọn đúng các dòng đang hiện sau lọc — giữ nguyên lựa chọn ở dòng bị lọc khuất.
  function toggleAllFiltered() {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const m of filtered) {
        if (allFilteredChecked) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  }

  function print() {
    if (checked.size === 0) return;
    window.open(`/api/qr/labels?kind=mt&ids=${[...checked].join(",")}`, "_blank", "noopener");
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[85vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />
        <h3 className="font-semibold text-sm flex-1">Chọn vật tư để in tem QR</h3>
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 flex flex-col min-h-0">
        <div className="relative shrink-0">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo mã BOQ / tên…"
            aria-label="Tìm vật tư"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 h-10 text-base sm:text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <label className="shrink-0 flex items-center gap-2.5 px-3 h-10 text-sm text-zinc-300 cursor-pointer rounded-lg hover:bg-zinc-800/50">
          <input
            type="checkbox"
            checked={allFilteredChecked}
            onChange={toggleAllFiltered}
            disabled={filtered.length === 0}
            className="w-4 h-4 accent-emerald-600 shrink-0"
          />
          {q.trim() ? `Chọn tất cả ${filtered.length} vật tư đang lọc` : "Chọn tất cả"}
        </label>

        <div className="flex-1 min-h-0 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 text-center">Không tìm thấy vật tư nào.</p>
          ) : (
            filtered.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2.5 px-3 min-h-10 py-1.5 text-sm hover:bg-zinc-800/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked.has(m.id)}
                  onChange={() => toggle(m.id)}
                  aria-label={`Chọn ${m.name} để in tem QR`}
                  className="w-4 h-4 accent-emerald-600 shrink-0"
                />
                <span
                  className={`font-mono text-xs shrink-0 w-20 truncate ${m.boqCode ? "text-amber-400" : "text-zinc-500"}`}
                >
                  {m.boqCode ?? "—"}
                </span>
                <span className="truncate">{m.name}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-zinc-400">Đã chọn {checked.size} vật tư</p>
          <button
            onClick={print}
            disabled={checked.size === 0}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-semibold px-4 h-10 rounded-lg text-sm"
          >
            <QrCode className="w-4 h-4" /> In tem QR
          </button>
        </div>
      </div>
    </Modal>
  );
}
